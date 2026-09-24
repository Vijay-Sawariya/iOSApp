type ContactLead = {
  can_view_sensitive?: boolean;
  assignment_can_view_private?: boolean | number | string | null;
  current_assignee_id?: number | null;
  assigned_to?: number | null;
  phone?: string | null;
};

const hasGrant = (lead: ContactLead) => lead.assignment_can_view_private === true || lead.assignment_can_view_private === 1 || lead.assignment_can_view_private === '1';

export const canViewLeadContacts = (lead: ContactLead | null | undefined, userId?: number | string) => {
  if (!lead || lead.can_view_sensitive !== true) return false;
  const assignee = lead.current_assignee_id || lead.assigned_to;
  return !assignee || Number(assignee) !== Number(userId) || hasGrant(lead);
};

export const canContactAssignedLead = (lead: ContactLead) =>
  hasGrant(lead) && lead.can_view_sensitive === true &&
  !!lead.phone && /^[+\d\s().,\/-]+$/.test(lead.phone) && lead.phone.replace(/\D/g, '').length >= 7;
