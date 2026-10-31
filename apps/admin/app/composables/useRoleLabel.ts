/** Rollenbezeichnung abhängig vom Organisationstyp (Schule vs. Unternehmen) */
export function useRoleLabel(type: MaybeRefOrGetter<OrganizationType | null | undefined>) {
  const { t } = useI18n()
  return (role: MemberRole) => t(`roles.${toValue(type) ?? 'school'}.${role}`)
}
