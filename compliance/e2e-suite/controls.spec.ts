import {
  generateComplianceReport,
  mapControl,
  registerControls
} from "compliance-reporter";
import fs from "fs";
import { K8s, kind } from "pepr";
import { describe, expect, it } from "vitest";

export const controls = registerControls({
  SecurityContext: {
    id: "AC-1",
    description: "Prevents Pod Escalation",
    remarks: "Does not allow Pods to run as root or escalate privileges",
  },
  Storage: {
    id: "AC-2",
    description: "Prevents Volume Escalation",
    remarks: "Does not allow Volume to be mounted with elevated privileges"
  },

  ServiceMesh: {
    id: "NIST-800-53-5",
    description: "Service Mesh",
    remarks: "Uses mTLS for encrypted communication between services"
  },

  NetworkPolicy: {
    id: "NIST-800-53-6",
    description: "Network Policy",
    remarks: "Uses Network Policies to control traffic between pods"
  },
})
describe("KSI Continuous Scanning", () => {
    it("does not allow privilege escalation", async () => {
      const controlMessage = "Privilege escalation is disallowed.";
      try {
          await K8s(kind.Pod).Apply({
            metadata: {
                name: "escalated-pod",
                namespace: "default",
            },
            spec: {
                containers: [{
                    name: "escalated-container",
                    image: "nginx",
                    securityContext: {
                        allowPrivilegeEscalation: true, 
                    },
                }],
            },
        })
        mapControl(controls.SecurityContext, `FAIL - ${controlMessage}`);
      } catch (error) {
        expect(error.data.message).toContain(controlMessage);
        mapControl(controls.SecurityContext, `PASS - ${controlMessage}`);
      }
    })

    it("does not allow containers to run as root", async () => {
      const controlMessage = "Containers must not run as root.";
      try {
          await K8s(kind.Pod).Apply({
            metadata: {
                name: "escalated-pod",
                namespace: "default",
            },
            spec: {
                containers: [{
                    name: "escalated-container",
                    image: "nginx",
                    securityContext: {
                        runAsUser: 0, 
                    },
                }],
            },
        })
        mapControl(controls.SecurityContext, `FAIL - ${controlMessage}`);
      } catch (error) {
        expect(error.data.message).toContain(controlMessage);
        mapControl(controls.SecurityContext, `PASS - ${controlMessage}`);
      }
    })
    it("does not allow mounting to hostpath", async () => {
      const controlMessage = "Volume kubelet-dir has a disallowed volume type of 'hostPath'.";
      try {
          await K8s(kind.Pod).Apply({
            metadata: {
                name: "hostpath-volume",
                namespace: "default",
            },
            spec: {
                containers: [{
                    name: "hostpath-volume",
                    image: "nginx",
                    volumeMounts: [{
                        mountPath: "/opt/kubelet",
                        name: "kubelet-dir"
                    }],
                }],
                volumes: [{
                    name: "kubelet-dir",
                    hostPath: {
                      path: "/var/lib/kubelet",
                      type: "Directory"
                    }
                }],
            },
        })
        mapControl(controls.Storage, `FAIL - ${controlMessage}`);
      } catch (error) {
        expect(error.data.message).toContain(controlMessage);
        mapControl(controls.Storage, `PASS - ${controlMessage}`);
      }
    })

    it("requires volumes to be readOnly", async () => {
      const controlMessage = "hostPath volume 'kubelet-dir' must be mounted as readOnly.";
      try {
          await K8s(kind.Pod).Apply({
            metadata: {
                name: "hostpath-volume",
                namespace: "default",
            },
            spec: {
                containers: [{
                    name: "hostpath-volume",
                    image: "nginx",
                    volumeMounts: [{
                        mountPath: "/opt/kubelet",
                        name: "kubelet-dir"
                    }],
                }],
                volumes: [{
                    name: "kubelet-dir",
                    hostPath: {
                      path: "/var/lib/kubelet",
                      type: "Directory"
                    }
                }],
            },
        })
        mapControl(controls.Storage, `FAIL - ${controlMessage}`);
      } catch (error) {
        expect(error.data.message).toContain(controlMessage);
        mapControl(controls.Storage, `PASS - ${controlMessage}`);
      }
    })

    it("writes the final compliance report", ()=> {
      const report = generateComplianceReport()
      fs.writeFileSync("compliance-report.json", JSON.stringify(report, null, 2));
      expect(fs.readFileSync("compliance-report.json", "utf-8")).toContain("Prevents Pod Escalation");
    })
})
