const { K8s, kind } = require("kubernetes-fluent-client");

module.exports = async () => {
  await K8s(kind.Namespace).Apply({
    metadata: {
      name: "policy-tests",
      labels: {
        "istio-injection": "disabled",
        "zarf.dev/agent": "ignore",
      },
    },
  });
}
