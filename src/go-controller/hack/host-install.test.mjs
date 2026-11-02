// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import yaml from "js-yaml";

const exec = promisify(execFile);
const moduleDir = path.resolve(import.meta.dirname, "..");
const cli = process.env.UDS_TRANSITION_TEST_CLI;
const binary = process.env.UDS_TRANSITION_TEST_BINARY;

// Exercise actual Zarf file extraction, action environments, and failure hooks.
// No real cluster is contacted: only preflight runs against a loopback API fixture.
test(
  "packaged host transition inherits kubeconfig and leaves no installer files",
  {
    skip: !cli || !binary,
  },
  async t => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "core-host-install-"));
    t.after(() => fs.rm(scratch, { recursive: true, force: true }));
    const requests = [];
    let reject = false;
    const server = http.createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      res.setHeader("Content-Type", "application/json");
      if (reject) {
        res.writeHead(403);
        res.end(JSON.stringify({ message: "injected preflight failure" }));
        return;
      }
      assert.equal(req.method, "GET");
      if (req.url === "/version") {
        res.end(JSON.stringify({ gitVersion: "v1.36.5+k3s1" }));
        return;
      }
      if (req.url === "/apis/uds.dev/v1alpha1/exemptions?limit=500") {
        res.end(
          JSON.stringify({ apiVersion: "uds.dev/v1alpha1", kind: "ExemptionList", items: [] }),
        );
        return;
      }
      assert.equal(req.url, "/apis/admissionregistration.k8s.io/v1");
      res.end(
        JSON.stringify({
          resources: [
            "validatingadmissionpolicies",
            "validatingadmissionpolicybindings",
            "mutatingadmissionpolicies",
            "mutatingadmissionpolicybindings",
          ].map(name => ({ name })),
        }),
      );
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const config = path.join(scratch, "existing kubeconfig");
    const contents = yaml.dump({
      apiVersion: "v1",
      kind: "Config",
      clusters: [
        { name: "fixture", cluster: { server: `http://127.0.0.1:${server.address().port}` } },
      ],
      contexts: [{ name: "fixture", context: { cluster: "fixture", user: "fixture" } }],
      users: [{ name: "fixture", user: {} }],
      "current-context": "fixture",
    });
    await fs.writeFile(config, contents, { mode: 0o600 });
    const source = yaml.load(await fs.readFile(path.join(moduleDir, "zarf.yaml"), "utf8"));
    const tools = source.components.find(c => c.name === "uds-core-tools");
    const final = source.components.find(c => c.name === "uds-controller");
    const host = `${os.platform() === "darwin" ? "darwin" : "linux"}-${os.arch() === "x64" ? "amd64" : "arm64"}`;
    tools.files = tools.files.filter(f =>
      [host, "run", "admission-contract.json"].includes(path.basename(f.target)),
    );
    for (const file of tools.files) {
      const name = path.basename(file.target);
      file.source =
        name === host
          ? binary
          : name === "run"
            ? path.join(moduleDir, "hack/run-transition.sh")
            : path.join(scratch, "contract.json");
    }
    await fs.writeFile(path.join(scratch, "contract.json"), "{}");

    for (const scenario of [
      "success",
      "preflight-failure",
      "setup-failure",
      "later-failure",
      "existing-directory",
    ]) {
      await t.test(scenario, async () => {
        reject = scenario === "preflight-failure";
        const dir = path.join(scratch, scenario);
        const cwd = path.join(dir, "deploy cwd");
        const tmp = path.join(dir, "temporary files");
        await fs.mkdir(cwd, { recursive: true });
        await fs.mkdir(tmp);
        const sentinel = path.join(cwd, ".uds-core-transition", "do-not-delete");
        if (scenario === "existing-directory") {
          await fs.mkdir(path.dirname(sentinel));
          await fs.writeFile(sentinel, "owned by the user");
        }
        const definition = {
          kind: "ZarfPackageConfig",
          metadata: { name: "core-host-install-test", version: "0.0.1" },
          variables: source.variables.filter(v => v.name.startsWith("UDS_CORE_TRANSITION_")),
          components: [
            structuredClone(tools),
            {
              name: "later-component",
              required: true,
              actions: {
                onDeploy: {
                  after: [{ cmd: scenario === "later-failure" ? "exit 23" : "true" }],
                  onSuccess: final.actions.onDeploy.onSuccess,
                  onFailure: final.actions.onDeploy.onFailure,
                },
              },
            },
          ],
        };
        if (scenario === "setup-failure") {
          definition.components[0].actions.onDeploy.before.push({ cmd: "exit 23" });
        }
        await fs.writeFile(path.join(dir, "zarf.yaml"), yaml.dump(definition));
        const env = { ...process.env, KUBECONFIG: config };
        const common = { cwd, env, maxBuffer: 4 * 1024 * 1024, timeout: 120000 };
        const flags = ["--confirm", "--cache", path.join(scratch, "cache"), "--tmpdir", tmp];
        await exec(
          cli,
          ["zarf", "package", "create", dir, "--skip-sbom", "--output", dir, ...flags],
          common,
        );
        const archive = (await fs.readdir(dir)).find(f => f.endsWith(".tar.zst"));
        let failure;
        try {
          await exec(cli, ["zarf", "package", "deploy", path.join(dir, archive), ...flags], common);
        } catch (err) {
          failure = err;
        }
        if (scenario === "success") assert.equal(failure, undefined, failure?.stderr);
        else {
          assert(failure, "injected failure must fail deployment");
          assert.match(failure.stdout + failure.stderr, /recovery continues with Go/);
        }
        assert.deepEqual(await fs.readdir(tmp), [], "Zarf temporary directory leaked");
        assert.deepEqual(
          await fs.readdir(cwd),
          scenario === "existing-directory" ? [".uds-core-transition"] : [],
        );
        if (scenario === "existing-directory")
          assert.equal(await fs.readFile(sentinel, "utf8"), "owned by the user");
        assert.equal(await fs.readFile(config, "utf8"), contents, "existing kubeconfig changed");
      });
    }
    assert.equal(
      requests.length,
      7,
      "preflight did not use the inherited kubeconfig in each applicable deployment",
    );
  },
);

test("chart requires Kubernetes 1.36 and the native mutation API", { skip: !cli }, async () => {
  const chart = path.join(moduleDir, "chart");
  const render = (version, api = true) =>
    exec(
      cli,
      [
        "zarf",
        "tools",
        "helm",
        "template",
        "uds-controller",
        chart,
        "--namespace",
        "uds-system",
        "--kube-version",
        version,
        ...(api
          ? ["--api-versions", "admissionregistration.k8s.io/v1/MutatingAdmissionPolicy"]
          : ["--api-versions", "v1/Namespace"]),
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
  await assert.rejects(render("1.35.9"), error =>
    /kubeVersion.*1\.36|1\.36.*incompatible/s.test(error.stderr),
  );
  await assert.rejects(render("1.36.5", false), error =>
    /requires.*MutatingAdmissionPolicy/.test(error.stderr),
  );
  for (const version of ["1.36.5", "1.37.1"]) {
    const { stdout } = await render(version);
    assert.match(stdout, /kind: MutatingAdmissionPolicy/);
  }
});

test(
  "repair plans exactly match both rendered callback profiles and stay inactive at bootstrap",
  { skip: !cli },
  async () => {
    for (const mode of ["bootstrap", "broad", "narrow"]) {
      const args = [
        "zarf",
        "tools",
        "helm",
        "template",
        "uds-controller",
        path.join(moduleDir, "chart"),
        "--namespace",
        "uds-system",
        "--kube-version",
        "1.37.1",
        "--api-versions",
        "admissionregistration.k8s.io/v1/MutatingAdmissionPolicy",
      ];
      if (mode === "bootstrap")
        args.push(
          "--set",
          "admission.register=false,nativeAdmission.enabled=false,nativeAdmission.narrowCallbacks=false",
        );
      else args.push("--set", `nativeAdmission.narrowCallbacks=${mode === "narrow"}`);
      const { stdout } = await exec(cli, args, { maxBuffer: 4 * 1024 * 1024 });
      const docs = yaml.loadAll(stdout).filter(Boolean);
      const plan = docs.find(
        d => d.kind === "ConfigMap" && d.metadata.name === "uds-controller-admission-registration",
      );
      assert.equal(plan.apiVersion, "v1");
      assert.equal(plan.data.active, String(mode !== "bootstrap"));
      const desired = JSON.parse(plan.data["registrations.json"]).items;
      assert.equal(desired.length, 5);
      const registrations = docs.filter(d =>
        /^(Mutating|Validating)WebhookConfiguration$/.test(d.kind),
      );
      if (mode === "bootstrap") assert.equal(registrations.length, 0);
      else
        for (const config of registrations) {
          const expected = desired.find(
            d => d.kind === config.kind && d.metadata.name === config.metadata.name,
          );
          for (const hook of config.webhooks) hook.clientConfig.caBundle = "";
          assert.deepEqual(
            expected.webhooks,
            config.webhooks,
            `${mode}/${config.metadata.name} repair drift`,
          );
          assert.equal(expected.metadata.annotations["admissions.enforcer/disabled"], "true");
        }
    }
  },
);
