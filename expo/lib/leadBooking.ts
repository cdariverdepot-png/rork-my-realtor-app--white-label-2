import { ensureSupabaseSession, supabase } from '@/lib/supabase';
import type { Appointment } from '@/contexts/AppointmentsContext';
export const isRealtorRef = (ref: string | undefined): ref is string => !!ref && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
/** Write-only endpoints do not download the private roster or appointments. */
export async function capturePublicLead(realtorId:string,contact:{name:string;email:string;phone?:string}):Promise<string>{
 if(!isRealtorRef(realtorId)) throw new Error('This booking link is invalid.');
 await ensureSupabaseSession(); if(!supabase) throw new Error('Please reconnect before continuing.');
 const {data,error}=await supabase.rpc('capture_public_lead',{p_realtor_id:realtorId,p_name:contact.name,p_email:contact.email,p_phone:contact.phone??''});
 if(error || typeof data!=='string') throw new Error('We couldn’t save your details. Please reconnect and try again.'); return data;
}
export async function appendLeadAppointment(realtorId:string,appt:Appointment):Promise<void>{
 if(!isRealtorRef(realtorId)) throw new Error('This booking link is invalid.');
 await ensureSupabaseSession(); if(!supabase) throw new Error('Please reconnect before sending your request.');
 const {error}=await supabase.rpc('request_public_showing',{p_realtor_id:realtorId,p_request_id:appt.id,p_listing_id:appt.listingId,p_starts_at:appt.startsAt,p_duration_min:appt.durationMin});
 if(error) throw new Error('We couldn’t send your viewing request. Check that the home and viewing time are still available, then try again.');
}
