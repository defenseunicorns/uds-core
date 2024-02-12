<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false showAnotherWayIfPresent=true>
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml" class="${properties.kcHtmlClass!}">

    <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="robots" content="noindex, nofollow">
        <#if properties.meta?has_content>
            <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>
${msg("loginTitle",(realm.displayName!''))}
</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
</head>
<body class="${properties.kcBodyClass!}">
    <div class="container-fluid">
        <div class="row justify-content-center">
            <div class="col-xl-5 col-lg-7 col-md-10">
                <div class="card">
                    <div class="card-header branding row">
                        <div class="col-sm-5 p-0">
                            <#if client?? && client.description?has_content>
                                <img src="${client.description}"/>
                            <#else>
                                <img src="${url.resourcesPath}/img/uds-logo.svg"/>
                            </#if>
                        </div>
                        <div class="col-sm-1">&nbsp;</div>
                        <div class="col-sm-6 my-auto">
                            <#if client?? && client.name?has_content>
                                <#-- Check if the client name matches the specific entry -->
                                <#if client.name == "${" + "client_account-console" + "}">
                                    <h2 class="client-unique-name">
                                        My Account
                                    </h2>
                                <#else>
                                    <h2 class="client-unique-name">
                                        ${client.name?no_esc}
                                    </h2>
                                </#if>
                            <#else>
                                <h2>
                                    ${kcSanitize(msg("loginTitleHtml",(realm.displayNameHtml!'')))?no_esc}
                                </h2>
                            </#if>
                        </div>                        
                    </div>
                    <br>
                    <div class="card-body">
                        <#-- App-initiated actions should not see warning messages about the need to complete the action -->
                        <#-- during login.                                                                               -->
                        <#if displayMessage && message?has_content && (message.type != ' warning' || !isAppInitiatedAction??)>
                <div id="alert-error" class="error-messages alert alert-${message.type} ${properties.kcAlertClass!} alert-<#if message.type = 'error'>danger<#else>
${message.type}
</#if>">
                    <span class="${properties.kcAlertTitleClass!}">
                        ${kcSanitize(message.summary)?no_esc}
                    </span>
                </div>
        </#if>
        <#nested "form">
            <#if displayInfo>
                <div id="kc-info" class="${properties.kcSignUpClass!}">
                    <div id="kc-info-wrapper">
                        <#nested "info">
                    </div>
                </div>
            </#if>
            </div>
            </div>
            </div>
            </div>
            </div>
            <footer class="fixed-footer">
                <#-- <img src="${url.resourcesPath}/img/yoda-mission-obsessed.png" /> -->
                <img src="${url.resourcesPath}/img/full-du-logo.png" />
                <#-- Powered by DoD Platform One -->
            </footer>
            </body>

    </html>
</#macro>
