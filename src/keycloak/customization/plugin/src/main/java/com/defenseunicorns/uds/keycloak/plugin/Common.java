package com.defenseunicorns.uds.keycloak.plugin;

import java.util.Arrays;
import java.util.List;

public enum Common {
    ;

    /**
     * get user by email constant.
     */
    static final String EMAIL = "email";

    /**
     * The minimum length of username restricted by Mattermost.
     * https://docs.mattermost.com/preferences/manage-your-profile.html
     */
    static final int MIN_USER_NAME_LENGTH = 3;

    /**
     * The max length of username restricted by Mattermost.
     * https://docs.mattermost.com/preferences/manage-your-profile.html
     */
    static final int MAX_USER_NAME_LENGTH = 22;

    /**
     * The user id attribute tracks the Keycloak attribute that maps to the user's
     * x509 identity.
     */
    static final String USER_ID_ATTRIBUTE = "usercertificate";

    /**
     * Ignore x509.
     */
    static final String IGNORE_X509 = "IGNORE_X509";

    /**
     * The user active x509 attribute tracks if the user has an active x509 during
     * this session.
     */
    static final String USER_ACTIVE_X509_ATTR = "activecac";

    /**
     * The certificate policy OID must match one of these values.
     */
    static final List<String> REQUIRED_CERT_POLICIES = Arrays.asList(
            "2.16.840.1.101.2.1.11.5", // id-US-dod-medium
            "2.16.840.1.101.2.1.11.9", // id-US-dod-mediumhardware
            "2.16.840.1.101.2.1.11.10", // id-US-dod-PIV-Auth
            "2.16.840.1.101.2.1.11.18", // id-US-dod-medium-2048
            "2.16.840.1.101.2.1.11.19", // id-US-dod-mediumHardware-2048
            "2.16.840.1.101.2.1.11.20", // id-US-dod-PIV-Auth-2048
            "2.16.840.1.101.2.1.11.31", // id-US-dod-peerInterop
            "2.16.840.1.101.2.1.11.36", // id-US-dod-mediumNPE-112
            "2.16.840.1.101.2.1.11.37", // id-US-dod-mediumNPE-128
            "2.16.840.1.101.2.1.11.38", // id-US-dod-mediumNPE-192
            "2.16.840.1.101.2.1.11.39", // id-US-dod-medium-112
            "2.16.840.1.101.2.1.11.40", // id-US-dod-medium-128
            "2.16.840.1.101.2.1.11.41", // id-US-dod-medium-192
            "2.16.840.1.101.2.1.11.42", // id-US-dod-mediumHardware-112
            "2.16.840.1.101.2.1.11.43", // id-US-dod-mediumHardware-128
            "2.16.840.1.101.2.1.11.44", // id-US-dod-mediumHardware-192
            "2.16.840.1.101.2.1.11.59", // id-US-dod-admin
            "2.16.840.1.101.2.1.11.60", // id-US-dod-internalNPE-112
            "2.16.840.1.101.2.1.11.61", // id-US-dod-internalNPE-128
            "2.16.840.1.101.2.1.11.62", // id-US-dod-internalNPE-192
            "2.16.840.1.101.3.2.1.12.1", // id-eca-medium
            "2.16.840.1.101.3.2.1.12.2", // id-eca-medium-hardware
            "2.16.840.1.101.3.2.1.12.3", // id-eca-medium-token
            "2.16.840.1.101.3.2.1.12.4", // id-eca-medium-sha256
            "2.16.840.1.101.3.2.1.12.5", // id-eca-medium-token-sha256
            "2.16.840.1.101.3.2.1.12.6", // id-eca-medium-hardware-pivi
            "2.16.840.1.101.3.2.1.12.8", // id-eca-contentsigning-pivi
            "2.16.840.1.101.3.2.1.12.9", // id-eca-medium-device-sha256
            "2.16.840.1.101.3.2.1.12.10", // id-eca-medium-hardware-sha256
            "2.16.840.1.101.3.2.1.3.4", // id-fpki-certpcy-highAssurance
            "2.16.840.1.101.3.2.1.3.7", // id-fpki-common-hardware
            "2.16.840.1.101.3.2.1.3.12", // id-fpki-certpcy-mediumHardware
            "2.16.840.1.101.3.2.1.3.13", // id-fpki-common-authentication
            "2.16.840.1.101.3.2.1.3.16", // id-fpki-common-High
            "2.16.840.1.101.3.2.1.3.18", // id-fpki-certpcy-pivi-hardware
            "2.16.840.1.101.3.2.1.3.20", // id-fpki-certpcy-pivi-contentSigning
            "2.16.840.1.101.3.2.1.3.36", // id-fpki-common-devicesHardware
            "2.16.840.1.101.3.2.1.3.38", // id-fpki-certpcy-mediumDeviceHardware
            "2.16.840.1.101.3.2.1.3.39", // id-fpki-common-piv-contentSigning
            "2.16.840.1.101.3.2.1.3.24", // id-fpki-SHA1-hardware

            // ######## Entrust SSP PKI Assurance Levels ########
            "2.16.840.1.101.3.2.1.3.7", // id-fpki-common-hardware
            "2.16.840.1.101.3.2.1.3.13", // id-fpki-common-authentication
            "2.16.840.1.101.3.2.1.3.36", // id-fpki-common-devicesHardware
            "2.16.840.1.101.3.2.1.3.39", // id-fpki-common-piv-contentSigning

            // ######## ORC SSP PKI Asserted Policies ########
            "2.16.840.1.101.3.2.1.3.7", // id-fpki-common-hardware
            "2.16.840.1.101.3.2.1.3.13", // id-fpki-common-authentication
            "2.16.840.1.101.3.2.1.3.36", // id-fpki-common-devicesHardware
            "2.16.840.1.101.3.2.1.3.39", // id-fpki-common-piv-contentSigning

            // ######## Department of State PKI Assurance Levels ########
            "2.16.840.1.101.3.2.1.6.4", // state-high
            "2.16.840.1.101.3.2.1.6.12", // state-medHW
            "2.16.840.1.101.3.2.1.3.7", // id-fpki-common-hardware
            "2.16.840.1.101.3.2.1.3.13", // id-fpki-common-authentication
            "2.16.840.1.101.3.2.1.3.16", // id-fpki-common-high

            // ######## U.S. Treasury SSP PKI Assurance Levels########
            "2.16.840.1.101.3.2.1.5.4", // id-treasury-certpcy-mediumhardware
            "2.16.840.1.101.3.2.1.5.5", // id-treasury-certpcy-high
            "2.16.840.1.101.3.2.1.3.7", // id-fpki-common-hardware
            "2.16.840.1.101.3.2.1.3.13", // id-fpki-common-authentication
            "2.16.840.1.101.3.2.1.3.16", // id-fpki-common-high
            "2.16.840.1.101.3.2.1.3.36", // id-fpki-common-devicesHardware
            "2.16.840.1.101.3.2.1.3.39", // id-fpki-common-piv-contentSigning

            // ######## Symantec SSP PKI Assurance Levels ########
            "2.16.840.1.101.3.2.1.3.7", // id-fpki-common-hardware
            "2.16.840.1.101.3.2.1.3.13", // id-fpki-common-authentication
            "2.16.840.1.101.3.2.1.3.16", // id-fpki-common-High
            "2.16.840.1.101.3.2.1.3.36", // id-fpki-common-devicesHardware
            "2.16.840.1.101.3.2.1.3.39", // id-fpki-common-piv-contentSigning

            // ######## Verizon Business SSP PKI Assurance Levels ########
            "2.16.840.1.101.3.2.1.3.7", // id-fpki-common-hardware
            "2.16.840.1.101.3.2.1.3.13", // id-fpki-common-authentication
            "2.16.840.1.101.3.2.1.3.39", // id-fpki-common-piv-contentsigning

            // ######## Boeing PKI Assurance Levels ########
            "1.3.6.1.4.1.73.15.3.1.5", // id-Boeing-mediumHardware-SHA-1
            "1.3.6.1.4.1.73.15.3.1.12", // id-Boeing-mediumHardware-SHA256
            "1.3.6.1.4.1.73.15.3.1.16", // id-Boeing-mediumHardware-contentSigning-SHA1
            "1.3.6.1.4.1.73.15.3.1.17", // id-Boeing-mediumHardware-contentSigning-SHA256

            // ######## Carillon Federal Services PKI ########
            "1.3.6.1.4.1.45606.3.1.12", // id-carillon_mediumHardware-256
            "1.3.6.1.4.1.45606.3.1.20", // id-carillon_AIVHardware
            "1.3.6.1.4.1.45606.3.1.22", // id-carillon_AIVContentSigning

            // ######## CertiPath Bridge ########
            "1.3.6.1.4.1.24019.1.1.1.2", // id-certipath-mediumHardware
            "1.3.6.1.4.1.24019.1.1.1.3", // id-certipath-highHardware
            "1.3.6.1.4.1.24019.1.1.1.7", // id-IceCAP-hardware
            "1.3.6.1.4.1.24019.1.1.1.9", // id-IceCAP-contentSigning
            "1.3.6.1.4.1.24019.1.1.1.18", // id-certipath-variant-mediumHardware
            "1.3.6.1.4.1.24019.1.1.1.19", // id-certipath-variant-highHardware

            // ######## Entrust Non-Federal Issuer PKI Assurance Levels ########
            "2.16.840.1.114027.200.3.10.7.2", // id-emspki-nfssp-medium-hardware
            "2.16.840.1.114027.200.3.10.7.4", // id-emspki-nfssp-mediumauthentication
            "2.16.840.1.114027.200.3.10.7.6", // id-emspki-nfssp-pivi-hardware
            "2.16.840.1.114027.200.3.10.7.9", // id-emspki-nfssp-pivi-contentsigning
            "2.16.840.1.114027.200.3.10.7.13", // id-emspki-nfssp-pivi-cardAuth
            "2.16.840.1.114027.200.3.10.7.16", // id-emspki-nfssp-medium-devicesHW

            // ######## Exostar PKI Assurance Levels ########
            "1.3.6.1.4.1.13948.1.1.1.6", // id-exostar-mediumHardware-sha2

            // ######## IdenTrust NFI Assurance Levels ########
            "2.16.840.1.113839.0.100.12.1", // id-igc-MediumHardware-SigningCertificate
            "2.16.840.1.113839.0.100.12.2", // id-igc-MediumHardware-EncryptionCertificate
            "2.16.840.1.113839.0.100.18.0", // id-igc-pivi-hardware-identity
            "2.16.840.1.113839.0.100.18.1", // id-igc-pivi-hardware-signing
            "2.16.840.1.113839.0.100.18.2", // id-igc-pivi-hardware-encryption
            "2.16.840.1.113839.0.100.20.1", // id-igc-pivi-contentSigning

            // ######## Lockheed Martin PKI Assurance Levels ########
            "1.3.6.1.4.1.103.100.1.1.3.3", // #id-Lockheed-Martin-mediumAssuranceHardware-sha256

            // ######## NL MoD NFI PKI Assurance Levels ########
            "2.16.528.1.1003.1.2.5.1", // NL MoD Authenticity
            "2.16.528.1.1003.1.2.5.2", // NL MoD Irrefutability/signature
            "2.16.528.1.1003.1.2.5.3", // NL MoD Confidentiality

            // ######## Northrop Grumman PKI Assurance Levels ########
            "1.3.6.1.4.1.16334.509.2.6", // Northrop Grumman Enterprise Medium
            // Assurance-Hardware
            "1.3.6.1.4.1.16334.509.2.8", // Northrop Grumman Medium Assurance-256 Hardware
            // Token
            "1.3.6.1.4.1.16334.509.2.9", // Northrop Grumman PIV-I Assurance-256 Hardware
            // Token
            "1.3.6.1.4.1.16334.509.2.11", // Northrop Grumman PIV-I Assurance-256 Content
            // Signing

            // ######## ORC NFI PKI Assurance Levels ########
            "1.3.6.1.4.1.3922.1.1.1.12", // id-orc-nfissp-mediumhardware
            "1.3.6.1.4.1.3922.1.1.1.18", // id-orc-nfissp-pivi-hardware
            "1.3.6.1.4.1.3922.1.1.1.20", // id-orc-nfissp-pivi-contentSigning
            "1.3.6.1.4.1.3922.1.1.1.38", // id-orc-nfissp-mediumDevicesHardware

            // ######## Raytheon PKI Assurance Levels ########
            "1.3.6.1.4.1.1569.10.1.1", // id-raytheon-SHA1-high
            "1.3.6.1.4.1.1569.10.1.2", // id-raytheon-SHA1-mediumHardware
            "1.3.6.1.4.1.1569.10.1.12", // id-raytheon-SHA256-mediumHardware

            // ######## Symantec NFI PKI Assurance Levels ########
            "2.16.840.1.113733.1.7.23.3.1.7", // Non-Federal SSP MediumHardware
            "2.16.840.1.113733.1.7.23.3.1.18", // Non-Federal SSP PIV-I Hardware
            "2.16.840.1.113733.1.7.23.3.1.20", // Non-Federal SSP PIV-I contentSigning
            "2.16.840.1.113733.1.7.23.3.1.36", // Non-Federal SSP mediumDevicesHardware

            // ######## TSCP Bridge ########
            "1.3.6.1.4.1.38099.1.1.1.2", // id-tscp-MediumHardware
            "1.3.6.1.4.1.38099.1.1.1.5", // id-tscp-PIVI
            "1.3.6.1.4.1.38099.1.1.1.7", // id-tscp-PIVI-ContentSigning

            // ######## Verizon Business Non-Federal Issuer PKI Assurance Levels########
            "1.3.6.1.4.1.23337.1.1.8", // id-Cybertrust-Hardware
            "1.3.6.1.4.1.23337.1.1.10", // id-Cybertrust-Authentication
            "1.3.6.1.4.1.23337.1.1.11", // Id-Cybertrust-contentSigner

            // ######## ADO PKI Assurance Levels ########
            "1.2.36.1.334.1.2.1.2", // ADO Individual Medium Assurance
            "1.2.36.1.334.1.2.2.2" // ADO Resource Medium Assurance
    );

    /**
     * The certificate policy OID.
     */
    static final String CERTIFICATE_POLICY_OID = "2.5.29.32";

    /**
     * The maximum number of certificate policies to check.
     */
    static final int MAX_CERT_POLICIES_TO_CHECK = 10;
}
