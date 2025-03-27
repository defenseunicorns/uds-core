# Test Cases

1) Add Single Package / Remove Single Package
* Apply `single-pkg.yaml`
* Delete the package
-> Check: istioctl analyze reports no issues
-> Check: all resources are created and all are removed

2) Add Two Packages with the same Host / Remove Single Package
-> Check: istioctl analyze reports no issues
-> Check: Shared resources are created with the right annotations, only the annotations removed for removed package

3) Categorize errors when port is desired but not exposed via the gateway
* Apply `single-pkg-no-port.yaml`
-> Check: istioctl analyze reports some issues <insert here>