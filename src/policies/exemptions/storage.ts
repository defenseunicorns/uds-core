import { ExemptList } from ".";
import { neuvector, promtail } from "./matchers";

export const restrictHostPathWrite: ExemptList = [
  /**
   * Neuvector mounts the following hostPaths as writeable:
   * `/var/neuvector`: for Neuvector's buffering and persistent state
   */
  neuvector.controller,
  neuvector.enforcer,

  /**
   * Promtail mounts the following hostPaths:
   * - `/var/log/pods`: to tail pod logs
   * - `/var/lib/docker/containers`: to tail container logs
   * - `/run/promtail`: for Promtail's buffering and persistent state
   * Since logs can have sensitive information, it is better to exclude
   * Promtail from the policy than add the paths as allowable mounts
   */
  promtail.promtail,
];

export const restrictVolumeType: ExemptList = [
  /**
   * Neuvector requires HostPath volume types
   * Neuvector mounts the following hostPaths:
   * `/var/neuvector`: (as writable) for Neuvector's buffering and persistent state
   * `/var/run`: communication to docker daemon
   * `/proc`: monitoring of proccesses for malicious activity
   * `/sys/fs/cgroup`: important files the controller wants to monitor for malicious content
   * https://github.com/neuvector/neuvector-helm/blob/master/charts/core/templates/enforcer-daemonset.yaml#L108
   */
  neuvector.controller,
  neuvector.enforcer,

  /**
   * NEEDS FURTHER JUSTIFICATION
   * Promtail requires HostPath volume types
   * https://github.com/grafana/helm-charts/blob/main/charts/promtail/templates/daemonset.yaml#L120
   */
  promtail.promtail,
];
