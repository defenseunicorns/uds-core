import { KubeConfig, Exec } from "@kubernetes/client-node";
import { Capability, a, Log, R } from "pepr";

export const IstioJobTermination = new Capability({
  name: "istio-job-termination",
  description: "Ensure Istio sidecars are terminated after job completion",
});

// Use the 'When' function to create a new action
const { When } = IstioJobTermination;

When(a.Pod)
  .IsCreatedOrUpdated() // IsCreated doesn't trigger enough :thinking:
  .WithLabel("batch.kubernetes.io/job-name")
  .WithLabel("service.istio.io/canonical-name")
  .Watch(async pod => {
    if (pod.status.phase == "Running") {
      const podReadyForTermination = R.all(containerStatus => {
        return (
          containerStatus.state.terminated?.exitCode == 0 ||
          containerStatus.name == "istio-proxy"
        );
      })(pod.status.containerStatuses);

      if (podReadyForTermination) {
        Log.info("Attempting to terminate sidecar for " + pod.metadata.name);
        try {
          const kc = new KubeConfig();
          kc.loadFromDefault();
          const exec = new Exec(kc);

          await exec.exec(
            pod.metadata.namespace,
            pod.metadata.name,
            "istio-proxy",
            ["pilot-agent", "request", "POST", "/quitquitquit"],
            null, // Could capture exec stdout here
            null, // Could capture exec stderr here
            process.stdin,
            true,
          );
        } catch (error) {
          // This is buggy, too many watch triggers, exec will fail once pod terminates
          Log.error(error, "Failed to terminate the pod sidecar");
        }
      }
    }
  });
