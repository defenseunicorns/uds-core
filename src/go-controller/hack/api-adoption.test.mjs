// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import yaml from "js-yaml";

const exec = promisify(execFile);
const cli = process.env.UDS_TRANSITION_TEST_CLI;
const kubeconfig = process.env.UDS_API_TEST_KUBECONFIG;
const root = path.resolve(import.meta.dirname, "../../..");
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

test(
  "live CRD adoption preserves identity and Helm upgrades the parameter schema",
  {
    skip: !cli || !kubeconfig,
  },
  async t => {
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "core-api-adoption-"));
    const cleanups = [];
    t.after(async () => {
      const errors = [];
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      await fs.rm(scratch, { recursive: true, force: true });
      if (errors.length) throw new AggregateError(errors, "API fixture cleanup failed");
    });
    const options = {
      env: { ...process.env, KUBECONFIG: kubeconfig },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120000,
    };
    const kubectl = (...args) =>
      exec(cli, ["zarf", "tools", "kubectl", "--kubeconfig", kubeconfig, ...args], options);
    const helm = (...args) =>
      exec(cli, ["zarf", "tools", "helm", ...args, "--kubeconfig", kubeconfig], options);
    const chart = path.join(root, "src/uds-api/chart");
    const { stdout: rendered } = await helm(
      "template",
      "uds-cluster-crds",
      chart,
      "--namespace",
      "uds-system",
      "--kube-version",
      "1.37.1",
    );
    const crds = yaml.loadAll(rendered).filter(obj => obj?.kind === "CustomResourceDefinition");
    assert.equal(crds.length, 4);
    // Refuse an existing Core installation. Cleanup targets only created UIDs.
    for (const crd of crds) {
      const { stdout } = await kubectl(
        "get",
        "crd",
        crd.metadata.name,
        "--ignore-not-found",
        "-o",
        "name",
      );
      assert.equal(
        stdout.trim(),
        "",
        `existing CRD ${crd.metadata.name}; use an empty disposable cluster`,
      );
    }
    const uids = new Map();
    for (const crd of crds) {
      crd.metadata.annotations = { "example.com/preserve": "unrelated" };
      const file = path.join(scratch, crd.metadata.name + ".json");
      await fs.writeFile(file, JSON.stringify(crd));
      const { stdout } = await kubectl("create", "-f", file, "-o", "json");
      const created = JSON.parse(stdout);
      uids.set(crd.metadata.name, created.metadata.uid);
      cleanups.push(async () => {
        const body = path.join(scratch, crd.metadata.name + "-delete.json");
        await fs.writeFile(
          body,
          JSON.stringify({
            apiVersion: "v1",
            kind: "DeleteOptions",
            preconditions: { uid: created.metadata.uid },
          }),
        );
        await kubectl(
          "delete",
          "--raw",
          "/apis/apiextensions.k8s.io/v1/customresourcedefinitions/" + crd.metadata.name,
          "-f",
          body,
        );
      });
      await kubectl(
        "wait",
        "crd/" + crd.metadata.name,
        "--for=condition=Established",
        "--timeout=30s",
      );
    }
    const definition = yaml.load(
      await fs.readFile(path.join(root, "src/uds-api/zarf.yaml"), "utf8"),
    );
    const actions = definition.components[0].actions.onDeploy.before;
    const adopt = async () => {
      for (const action of actions) {
        await exec(
          "/bin/sh",
          ["-eu", "-c", action.cmd.replaceAll("./zarf ", quote(cli) + " zarf ")],
          options,
        );
      }
    };
    await adopt();
    for (const [name, uid] of uids) {
      const current = JSON.parse((await kubectl("get", "crd", name, "-o", "json")).stdout);
      assert.equal(current.metadata.uid, uid);
      assert.equal(current.metadata.annotations["example.com/preserve"], "unrelated");
      assert.equal(current.metadata.annotations["meta.helm.sh/release-name"], "uds-cluster-crds");
    }
    const parameter = "admissionparameters.policy.uds.dev";
    await kubectl("annotate", "crd", parameter, "meta.helm.sh/release-name=foreign", "--overwrite");
    await assert.rejects(adopt(), error => /belongs to another release/.test(error.stderr));
    assert.equal(
      JSON.parse((await kubectl("get", "crd", parameter, "-o", "json")).stdout).metadata
        .annotations["meta.helm.sh/release-name"],
      "foreign",
    );
    // The previous controller-owned parameter CRD is an explicitly allowed source.
    await kubectl(
      "annotate",
      "crd",
      parameter,
      "meta.helm.sh/release-name=uds-controller",
      "--overwrite",
    );
    await adopt();
    const ns = JSON.parse(
      (await kubectl("create", "namespace", "uds-system", "-o", "json")).stdout,
    );
    cleanups.push(async () => {
      const file = path.join(scratch, "namespace-delete.json");
      await fs.writeFile(
        file,
        JSON.stringify({
          apiVersion: "v1",
          kind: "DeleteOptions",
          preconditions: { uid: ns.metadata.uid },
        }),
      );
      await kubectl("delete", "--raw", "/api/v1/namespaces/uds-system", "-f", file);
    });
    const packageFile = path.join(scratch, "package.json");
    await fs.writeFile(
      packageFile,
      JSON.stringify({
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "identity-proof", namespace: "uds-system" },
        spec: {},
      }),
    );
    const pkg = JSON.parse((await kubectl("create", "-f", packageFile, "-o", "json")).stdout);
    await helm(
      "upgrade",
      "--install",
      "uds-cluster-crds",
      chart,
      "--namespace",
      "uds-system",
      "--wait",
      "--server-side=false",
    );
    const upgradedChart = path.join(scratch, "chart");
    await fs.cp(chart, upgradedChart, { recursive: true });
    const schemaPath = path.join(upgradedChart, "templates", parameter + ".json");
    const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));
    schema.spec.versions[0].schema.openAPIV3Schema.description = "upgrade test marker";
    await fs.writeFile(schemaPath, JSON.stringify(schema));
    await helm(
      "upgrade",
      "uds-cluster-crds",
      upgradedChart,
      "--namespace",
      "uds-system",
      "--wait",
      "--server-side=false",
    );
    const actual = JSON.parse((await kubectl("get", "crd", parameter, "-o", "json")).stdout);
    assert.equal(actual.metadata.uid, uids.get(parameter));
    assert.equal(actual.spec.versions[0].schema.openAPIV3Schema.description, "upgrade test marker");
    assert.equal(
      JSON.parse(
        (await kubectl("get", "package", "identity-proof", "-n", "uds-system", "-o", "json"))
          .stdout,
      ).metadata.uid,
      pkg.metadata.uid,
    );
  },
);
