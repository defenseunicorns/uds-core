# Loki Pepr Capability

This project defines a Kubernetes capability using TypeScript and `pepr` to handle mutations for Loki configuration secrets. The primary goal is to manage the `from` date in the `v13` schema configuration of a Loki stack's `config.yaml`. The logic ensures that the date is set only once to a future date during the initial setup and remains unchanged in subsequent updates unless manually altered.
