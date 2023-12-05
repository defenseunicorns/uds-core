const { K8s, kind } = require("kubernetes-fluent-client");

module.exports = async () => {
  await K8s(kind.Namespace).Delete("policy-tests");
}
