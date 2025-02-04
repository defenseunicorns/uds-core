export type Config = {
  domain: string;
  adminDomain: string;
  caCert: string;
  authserviceRedisUri: string | undefined;
  allowAllNSExemptions: boolean;
  kubeApiCidr: string | undefined;
  kubeNodeCidrs: string[];
  isIdentityDeployed: boolean;
};
