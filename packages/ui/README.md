# UDS Core UI (Runtime)

This layer of UDS Core provides UI capabilities. Currently it includes the application(s):
- runtime

To deploy this layer you must also deploy its dependent layer(s):
- base
- identity-authorization [( unless disabled with runtime override )](https://github.com/defenseunicorns/uds-runtime/blob/v0.5.0/chart/values.yaml)