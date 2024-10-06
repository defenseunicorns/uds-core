# UDS Core Logging

This layer of UDS Core provides log collection and storage capabilities. Currently it includes the application(s):
- Vector: Log collection and shipping
- Loki: Log storage and querying

To deploy this layer you must also deploy its dependent layer(s):
- Base
- Monitoring (optional to provide UI interaction with logs)
