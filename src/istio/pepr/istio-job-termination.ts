import { Exec, KubeConfig } from "@kubernetes/client-node";
import { Capability, Log, a } from "pepr";

export const IstioJobTermination = new Capability({
  name: "istio-job-termination",
  description: "Ensure Istio sidecars are terminated after job completion",
});

// Use the 'When' function to create a new action
const { When } = IstioJobTermination;

// Keep track of in-progress terminations
const inProgress: Record<string, boolean> = {};

When(a.Pod)
  .IsUpdated()
  .WithLabel("batch.kubernetes.io/job-name")
  .WithLabel("service.istio.io/canonical-name")
  .Watch(async pod => {
    if (
      !pod.metadata?.name ||
      !pod.metadata.namespace ||
      !pod.status?.containerStatuses
    ) {
      Log.error(pod, `Invalid Pod definition`);
      return;
    }

    const { name, namespace } = pod.metadata;
    const key = `${namespace}/${name}`;

    // Ensure termination isn't already in progress
    if (inProgress[key]) {
      return;
    }

    // Only terminate if the pod is running
    if (pod.status.phase == "Running") {
      // Check all container statuses
      const shouldTerminate = pod.status.containerStatuses
        // Ignore the istio-proxy container
        .filter(c => c.name != "istio-proxy")
        // and if ALL are terminated AND have exit code 0, then shouldTerminate is true
        .every(c => c.state?.terminated && c.state.terminated.exitCode == 0);

      if (shouldTerminate) {
        // Mark the pod as seen
        inProgress[key] = true;

        Log.info(`Attempting to terminate sidecar for ${key}`);
        try {
          const kc = new KubeConfig();
          kc.loadFromDefault();
          const exec = new Exec(kc);

          await exec.exec(
            namespace,
            name,
            "istio-proxy",
            ["pilot-agent", "request", "POST", "/quitquitquit"],
            null, // Could capture exec stdout here
            null, // Could capture exec stderr here
            process.stdin,
            true,
          );

          Log.info(`Terminated sidecar for ${key}`);
        } catch (error) {
          Log.error(error, `Failed to terminate the sidecar for ${key}`);

          // Remove the pod from the seen list
          inProgress[key] = false;
        }
      }
    }
  });
