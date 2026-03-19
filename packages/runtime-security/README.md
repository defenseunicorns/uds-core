# UDS Core Runtime Security

This layer of UDS Core provides Runtime Security capabilities. Currently it includes the application(s):
- Falco
- Falcosidekick

To deploy this layer you must also deploy its dependent layer(s):
- base
- logging (optional for Falco to send events to Loki)
