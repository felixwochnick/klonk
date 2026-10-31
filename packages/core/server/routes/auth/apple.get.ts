// Privatkonto per Apple (nuxt-auth-utils, Zugangsdaten über NUXT_OAUTH_APPLE_*)
export default defineOAuthAppleEventHandler({
  async onSuccess(event, { user, payload }) {
    const name = [user?.name?.firstName, user?.name?.lastName].filter(Boolean).join(' ')
    return finishPrivateLogin(event, {
      provider: 'apple',
      providerAccountId: String(payload.sub),
      displayName: name,
      email: payload.email,
    })
  },
  onError: privateLoginFailed,
})
