import React from 'react';
import { Text, View } from 'react-native';
import { formatEnquiryDate } from '../services/enquiryPresentation';
import { enquiryStyles as s } from './EnquiryControls';

type Followup = { status: string; due_date?: string; due_time?: string | null; description?: string | null };
export default function EnquiryFollowupSummary({ followup }: { followup: Followup }) {
  const dueAt = followup.due_date ? `${followup.due_date}T${followup.due_time || '00:00:00'}` : null;
  return <View style={{ gap: 4 }}>
    <Text style={[s.text, { fontWeight: '700' }]}>Follow-up • {followup.status}</Text>
    <Text style={s.text}>{formatEnquiryDate(dueAt)} (Asia/Kolkata)</Text>
    {!!followup.description && <Text style={s.text}>{followup.description}</Text>}
  </View>;
}
