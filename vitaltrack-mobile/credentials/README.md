# Google Service Account Key
# 
# To set up automated Play Store submissions:
# 1. Go to Google Cloud Console
# 2. Create a Service Account with 'Service Account User' role
# 3. In Play Console, grant 'Release Manager' access to the service account
# 4. Download the JSON key and place it here as:
#    google-service-account.json
#
# Never commit this file to version control!

#
# Status (7 October 2026): eas.json "submit.production" reads ./credentials/google-service-account.json
# and uploads to the "internal" track. vitaltrack-mobile/.gitignore excludes credentials/*.json.
# Play Console role and permission names change over time; check the current Play Console
# "Users and permissions" page instead of relying on the role named above (NOT VERIFIED).
