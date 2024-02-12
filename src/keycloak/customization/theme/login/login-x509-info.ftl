<#import "template.ftl" as layout>
    <@layout.registrationLayout; section>
        <#if section="form">
            <form id="kc-x509-login-info" class="" action="${url.loginAction}" method="post">
                <div class="form-group">
                    <div class="alert alert-info cac-info">
                        <h2>DoD PKI Detected</h2>
                        <#if x509.formData.subjectDN??>
                            <p id="certificate_subjectDN" class="">
                                ${(x509.formData.subjectDN!"")}
                            </p>
                            <#else>
                                <p id="certificate_subjectDN" class="">
                                    ${msg("noCertificate")}
                                </p>
                        </#if>
                    </div>
                </div>
                <div class="form-group">
                    <#if x509.formData.isUserEnabled??>
                        <label for="username" class="">
                            ${msg("doX509Login")}
                        </label>
                        <label id="username" class="font-weight-bold">
                            ${(x509.formData.username!'')}
                        </label>
                    </#if>
                </div>
                <div class="form-group">
                    <div id="kc-form-buttons" class="">
                        <div class="text-right">
                            <input class="btn btn-primary" name="login" id="kc-login" type="submit" value="${msg("doContinue")}" autofocus />
                            <#if x509.formData.isUserEnabled??>
                                <input class="btn btn-light" name="cancel" id="kc-cancel" type="submit" value="${msg("doIgnore")}" />
                            </#if>
                        </div>
                    </div>
                </div>
            </form>
        </#if>
        </@layout.registrationLayout>
