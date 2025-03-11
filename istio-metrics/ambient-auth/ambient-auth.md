# Ambient (w/ L4 Auth Policies)

Placeholder - need to write some code here to evaluate this? Probably just apply some manual auth pols for now...

## Setup

Run the setup script which will install slim dev + metrics server + nginx (from uds-common). Post-install it will patch several changes to make our test perform better: `./setup.sh`

Tests will use [Vegeta](https://github.com/tsenart/vegeta). This can be installed with brew: `brew install vegeta`

## Testing

Each test below was run using the `test.sh` script with slightly different variables setup. All tests run for 5 minutes to produce a sufficient amount of data.

### 20 requests per second to a single Pod

```

```

### 50 requests per second to a single Pod

```

```

### 20 requests per second loadbalanced between 10 Pods

```

```

### 50 requests per second loadbalanced between 10 Pods

```

```

### 20 requests per second loadbalanced between 50 Pods

```

```

### 50 requests per second loadbalanced between 50 Pods

```

```
