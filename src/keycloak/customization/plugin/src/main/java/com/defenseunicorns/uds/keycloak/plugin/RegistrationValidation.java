package com.defenseunicorns.uds.keycloak.plugin;

import jakarta.ws.rs.core.MultivaluedMap;
import org.keycloak.authentication.FormContext;
import org.keycloak.authentication.ValidationContext;
import org.keycloak.authentication.forms.RegistrationPage;
import org.keycloak.authentication.forms.RegistrationUserCreation;
import org.keycloak.events.Details;
import org.keycloak.events.Errors;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;
import org.keycloak.services.messages.Messages;
import org.keycloak.services.validation.Validation;

import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

public class RegistrationValidation extends RegistrationUserCreation {

    public static final String PROVIDER_ID = "registration-validation-action";

    /**
     * Requirement choices.
     */
    private static final AuthenticationExecutionModel.Requirement[] REQUIREMENT_CHOICES = {
            AuthenticationExecutionModel.Requirement.REQUIRED };

    private static void bindRequiredActions(final UserModel user, final String x509Username) {
        // Default actions for all users
        user.addRequiredAction(UserModel.RequiredAction.VERIFY_EMAIL);

        if (x509Username == null) {
            // This user must configure MFA for their login
            user.addRequiredAction(UserModel.RequiredAction.CONFIGURE_TOTP);
        }
    }

    private static void processX509UserAttribute(final RealmModel realm, final UserModel user,
            final String x509Username) {
        if (x509Username != null) {
            // Bind the X509 attribute to the user
            user.setSingleAttribute(Common.USER_ID_ATTRIBUTE, x509Username);
        }
    }

    /**
     * Add a custom user attribute (mattermostid) to enable direct mattermost <>
     * keycloak auth on mattermost teams edition.
     *
     * @param formData The user registration form data
     * @param user     the Keycloak user object
     */
    private static void generateUniqueStringIdForMattermost(final MultivaluedMap<String, String> formData,
            final UserModel user) {

        String email = formData.getFirst(Validation.FIELD_EMAIL);

        byte[] encodedEmail;
        int emailByteTotal = 0;
        Date today = new Date();

        encodedEmail = email.getBytes(StandardCharsets.US_ASCII);
        for (byte b : encodedEmail) {
            emailByteTotal += b;
        }

        SimpleDateFormat formatDate = new SimpleDateFormat("yyDHmsS");

        user.setSingleAttribute("mattermostid", formatDate.format(today) + emailByteTotal);
    }

    @Override
    public void success(final FormContext context) {
        UserModel user = context.getUser();
        RealmModel realm = context.getRealm();
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        String x509Username = X509Tools.getX509Username(context);

        generateUniqueStringIdForMattermost(formData, user);
        processX509UserAttribute(realm, user, x509Username);
        bindRequiredActions(user, x509Username);
    }

    @Override
    public void buildPage(final FormContext context, final LoginFormsProvider form) {
        String x509Username = X509Tools.getX509Username(context);
        if (x509Username != null) {
            form.setAttribute("cacIdentity", x509Username);
        }
    }

    @Override
    public String getDisplayType() {
        return "UDS Registration Validation";
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public boolean isConfigurable() {
        return false;
    }

    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return REQUIREMENT_CHOICES;
    }

    /**
     * Validate the registration form.
     *
     * @param context The validation context
     */
    @Override
    public void validate(final ValidationContext context) {
        // Get the form data
        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();

        // Create a list to hold any errors
        List<FormMessage> errors = new ArrayList<>();
        String username = formData.getFirst(Validation.FIELD_USERNAME);
        String email = formData.getFirst(Validation.FIELD_EMAIL);

        String eventError = Errors.INVALID_REGISTRATION;

        // Require a username
        if (Validation.isBlank(username)) {
            errors.add(new FormMessage(Validation.FIELD_USERNAME, Messages.MISSING_USERNAME));
        }

        // Username validation based on Mattermost requirements.
        mattermostUsernameValidation(errors, username);

        // Require a first name
        if (Validation.isBlank(formData.getFirst(RegistrationPage.FIELD_FIRST_NAME))) {
            errors.add(new FormMessage(RegistrationPage.FIELD_FIRST_NAME, Messages.MISSING_FIRST_NAME));
        }

        // Require a last name
        if (Validation.isBlank(formData.getFirst(RegistrationPage.FIELD_LAST_NAME))) {
            errors.add(new FormMessage(RegistrationPage.FIELD_LAST_NAME, Messages.MISSING_LAST_NAME));
        }

        // Require a DoD affiliation
        if (Validation.isBlank(formData.getFirst("user.attributes.affiliation"))) {
            errors.add(new FormMessage("user.attributes.affiliation", "Please specify your organization affiliation."));
        }

        // Require a rank
        if (Validation.isBlank(formData.getFirst("user.attributes.rank"))) {
            errors.add(new FormMessage("user.attributes.rank", "Please specify your rank or choose n/a."));
        }

        // Require an organization
        if (Validation.isBlank(formData.getFirst("user.attributes.organization"))) {
            errors.add(new FormMessage("user.attributes.organization", "Please specify your organization."));
        }

        // Check if a X509 was used to authenticate and if it's already registered
        if (X509Tools.getX509Username(context) != null && X509Tools.isX509Registered(context)) {
            // X509 auth, invite code not required
            errors.add(new FormMessage(null, "Sorry, this CAC seems to already be registered."));
            context.error(Errors.INVALID_REGISTRATION);
            context.validationError(formData, errors);
        }

        if (Validation.isBlank(email) || !Validation.isEmailValid(email)) {
            context.getEvent().detail(Details.EMAIL, email);
            errors.add(new FormMessage(RegistrationPage.FIELD_EMAIL,
                    "Please check your email address, it seems to be invalid"));
        }

        if (context.getSession().users().getUserByEmail(context.getRealm(), email) != null) {
            eventError = Errors.EMAIL_IN_USE;
            formData.remove(Common.EMAIL);
            context.getEvent().detail(Common.EMAIL, email);
            errors.add(new FormMessage(Common.EMAIL, Messages.EMAIL_EXISTS));
        }

        if (!errors.isEmpty()) {
            context.error(eventError);
            context.validationError(formData, errors);
        } else {
            context.success();
        }

    }

    /**
     * Mattermost username validation to prevent incompatible usernames.
     * 
     * @param errors   List of form messages
     * @param username The username to validate
     */
    private void mattermostUsernameValidation(final List<FormMessage> errors, final String username) {
        if (!Validation.isBlank(username)) {
            // May only contain alphanumeric, underscore, hyphen and period characters
            if (!username.matches("[A-Za-z0-9-_.]+")) {
                errors.add(new FormMessage(Validation.FIELD_USERNAME,
                        "Username can only contain alphanumeric, underscore, hyphen and period characters."));
            }

            // Must begin with a letter
            if (!Character.isLetter(username.charAt(0))) {
                errors.add(new FormMessage(Validation.FIELD_USERNAME, "Username must begin with a letter."));
            }

            // Must be between 3 to 22 characters
            if (username.length() < Common.MIN_USER_NAME_LENGTH || username.length() > Common.MAX_USER_NAME_LENGTH) {
                errors.add(new FormMessage(Validation.FIELD_USERNAME, "Username must be between 3 to 22 characters."));
            }
        }
    }

}
