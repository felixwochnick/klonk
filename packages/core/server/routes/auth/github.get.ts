// Privatkonto per GitHub (nuxt-auth-utils, Zugangsdaten über NUXT_OAUTH_GITHUB_*)
export default withRememberedRedirect(defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {
    return finishPrivateLogin(event, {
      provider: 'github',
      providerAccountId: String(user.id),
      displayName: user.name ?? user.login,
      email: user.email,
    })
  },
  onError: privateLoginFailed,
}))
