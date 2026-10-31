// Privatkonto per Microsoft (nuxt-auth-utils, Zugangsdaten über NUXT_OAUTH_MICROSOFT_*)
export default defineOAuthMicrosoftEventHandler({
  async onSuccess(event, { user }) {
    return finishPrivateLogin(event, {
      provider: 'microsoft',
      providerAccountId: String(user.id),
      displayName: user.displayName ?? '',
      email: user.mail ?? user.userPrincipalName,
    })
  },
  onError: privateLoginFailed,
})
