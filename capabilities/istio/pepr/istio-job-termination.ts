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
    const { metadata, status } = pod;
    const { name, namespace } = metadata;

    // Ensure termination isn't already in progress
    if (inProgress[name]) {
      return;
    }

    // Only terminate if the pod is running
    if (status.phase == "Running") {
      // Check if the pod has a non-istio container that has terminated
      const canTerminate = !!status?.containerStatuses?.find(
        ({ name, state }) => name != "istio-proxy" && state?.terminated,
      );

      if (canTerminate) {
        // Mark the pod as seen
        inProgress[name] = true;

        Log.info(`Attempting to terminate sidecar for ${namespace}/${name}`);

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

          Log.info(`Terminated sidecar for ${namespace}/${name}`);
        } catch (error) {
          Log.error(
            error,
            `Failed to terminate the sidecar for ${namespace}/${name}`,
          );

          // Remove the pod from the seen list
          inProgress[name] = false;
        }
      }
    }
  });
