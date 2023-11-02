import { KubeConfig, Exec } from "@kubernetes/client-node";
import { Capability, a, R, Log } from "pepr";

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
      let podReadyForTermination = true;
      pod.spec.containers.forEach(container => {
        if (container.name == "istio-proxy") {
          return;
        }
        const terminated = R.find(R.propEq(container.name, "name"))(
          pod.status.containerStatuses,
        ).state.terminated;
        if (!terminated || terminated.exitCode != 0) {
          podReadyForTermination = false;
        }
      });
      // Validate status is still running due to multiple watches
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
