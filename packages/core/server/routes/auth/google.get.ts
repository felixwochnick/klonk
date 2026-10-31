// Privatkonto per Google (nuxt-auth-utils, Zugangsdaten über NUXT_OAUTH_GOOGLE_*)
export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    return finishPrivateLogin(event, {
      provider: 'google',
      providerAccountId: String(user.sub),
      displayName: user.name ?? '',
      email: user.email,
    })
  },
  onError: privateLoginFailed,
})
