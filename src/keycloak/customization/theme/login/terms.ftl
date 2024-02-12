<#import "template.ftl" as layout>
    <@layout.registrationLayout displayMessage=false; section>
        <#if section="form">
            <div id="kc-terms-text" onclick="javscript:document.getElementById('kc-accept').focus()">
                <div>
                    <div class="alert alert-info cac-info">
                        <span>Click anywhere on the terms below to move to [accept]
                            and [cancel]
                            actions.</span>
                    </div>
                    <h4>You are accessing a U.S. Government (USG) Information System (IS) that is provided for
                        USG-authorized use only.</h4>
                    <h5>By using this IS (which includes any device attached to this IS), you consent to the following
                        conditions:</h5>
                    <ul>
                        <li>The USG routinely intercepts and monitors communications on this IS for purposes including, but
                            not limited to, penetration testing, COMSEC monitoring, network operations and defense,
                            personnel misconduct (PM), law enforcement (LE), and counterintelligence (CI) investigations.
                        </li>
                        <li>At any time, the USG may inspect and seize data stored on this IS.</li>
                        <li>Communications using, or data stored on, this IS are not private, are subject to routine
                            monitoring, interception, and search, and may be disclosed or used for any USG authorized
                            purpose.
                        </li>
                        <li>This IS includes security measures (e.g., authentication and access controls) to protect USG
                            interests--not for your personal benefit or privacy.
                        </li>
                        <li>NOTICE: There is the potential that information presented and exported from the Platform One
                            contains FOUO or Controlled Unclassified Information (CUI). It is the responsibility of all
                            users to ensure information extracted from Platform One is appropriately marked and properly
                            safeguarded. If you are not sure of the safeguards necessary for the information, contact your
                            functional lead or Information Security Officer.
                        </li>
                        <li>As a user of this IS, you may have access to USG’s Platform One. Third-party software publishers
                            (“Vendors”) provide proprietary software, applications, and/or source code (including any proprietary
                            data made available through such third-party software) (collectively, “Third-Party Software”) to the USG
                            solely in order for the USG to harden such Third-Party Software and make such hardened versions of the
                            Third Party Software available to users of Platform One. In the event you use the IS
                            (including Platform One) to access, download, execute, display and/or otherwise use (collectively, “Use”)
                            such Third-Party Software, by Using the IS (including Platform One) and/or such Third-Party Software,
                            you, on behalf of your organization, hereby agree that all Use of such Third-Party Software is governed by
                            the Vendor’s end user license agreement (“Vendor EULA”), which may be enforced directly by Vendor and/or USG.
                            If you do not agree to the entirety of the applicable vendor eula, you are prohibited from using all or any
                            portion of the third-party software in any manner.
                        </li>
                        <li>Notwithstanding the above, using this IS does not constitute consent to PM, LE or CI
                            investigative searching or monitoring of the content of privileged communications, or work
                            product, related to personal representation or services by attorneys, psychotherapists, or
                            clergy, and their assistants. Such communications and work product are private and confidential.
                        </li>
                    </ul>
                </div>
            </div>
            <hr>
            <form class="form-actions text-right" action="${url.loginAction}" method="POST">
                <input class="btn btn-primary"
                    name="accept" id="kc-accept" type="submit" value="${msg("doAccept")}" />
                <input class="btn btn-light"
                    name="cancel" id="kc-decline" type="submit" value="${msg("doDecline")}" />
            </form>
            <div class="clearfix"></div>
        </#if>
    </@layout.registrationLayout>
