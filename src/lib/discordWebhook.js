import { callGAS } from './googleDriveUpload';
import { supabase } from '../supabaseClient';
import { notificationQueueEnabled } from './notificationFeatures';

function announce(message) {
  window.dispatchEvent(new CustomEvent('council-notification-status', { detail: { message } }));
}

async function deliverJob(job, allowUncertain = false) {
  const permitted = allowUncertain ? ['pending', 'failed', 'uncertain'] : ['pending', 'failed'];
  const { data: claimed, error: claimError } = await supabase.from('council_notification_outbox')
    .update({ status: 'sending', attempt_started_at: new Date().toISOString() })
    .eq('id', job.id).in('status', permitted).select().maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return false;
  let status = 'uncertain';
  let lastError;
  let sent = false;
  try {
    const result = await callGAS('send_discord_message', claimed.payload);
    sent = result?.discord?.success === true;
    status = sent ? 'sent' : 'failed';
    lastError = sent ? '' : result?.discord?.error || 'ปลายทางไม่ยืนยันการส่ง Discord';
    announce(sent ? (result?.push?.success === false
      ? 'ส่ง Discord แล้ว แต่แจ้งเตือนบนอุปกรณ์ไม่สำเร็จ: ' + (result.push.error || 'ไม่ทราบสาเหตุ')
      : 'ส่งการแจ้งเตือนแล้ว') : 'งานที่บันทึกไว้ไม่เปลี่ยนแปลง แต่ส่ง Discord ไม่สำเร็จ กดส่งซ้ำจากรายการแจ้งเตือนได้');
  } catch (error) {
    lastError = error.message;
    announce('งานที่บันทึกไว้ไม่เปลี่ยนแปลง แต่ยังยืนยันผลส่งไม่ได้ ตรวจข้อความปลายทางก่อนส่งซ้ำ');
  }
  const { error: updateError } = await supabase.from('council_notification_outbox')
    .update({ status, last_error: lastError || null }).eq('id', job.id);
  if (updateError) announce((sent ? 'ส่งแล้ว แต่' : '') + 'อัปเดตสถานะคิวไม่สำเร็จ: ' + updateError.message);
  window.dispatchEvent(new CustomEvent('council-notification-status', { detail: {} }));
  return sent;
}

export async function sendDiscordEmbedViaGAS(title, description, colorDecimal = 3066993, fields = [], imageUrl = null, channel = 'general', targetUserIds = null) {
  const payload = { title, description, color: colorDecimal, fields, imageUrl, channel, targetUserIds };
  if (!notificationQueueEnabled) {
    try {
      const result = await callGAS('send_discord_message', payload);
      if (result?.discord?.success !== true) announce('บันทึกรายการแล้ว แต่ส่ง Discord ไม่สำเร็จ: ' + (result?.discord?.error || 'ปลายทางไม่ยืนยันผล'));
      else if (result?.push?.success === false) announce('ส่ง Discord แล้ว แต่แจ้งเตือนบนอุปกรณ์ไม่สำเร็จ: ' + (result.push.error || 'ไม่ทราบสาเหตุ'));
      return result?.discord?.success === true;
    } catch (error) {
      announce('บันทึกรายการแล้ว แต่ยังยืนยันผลแจ้งเตือนไม่ได้: ' + error.message);
      return false;
    }
  }
  try {
    const { data: job, error } = await supabase.from('council_notification_outbox').insert({
      payload,
    }).select().single();
    if (error) throw error;
    return await deliverJob(job);
  } catch (error) {
    announce('งานที่บันทึกไว้ไม่เปลี่ยนแปลง แต่จัดคิวแจ้งเตือนไม่สำเร็จ: ' + error.message);
    return false;
  }
}

export async function retryCouncilNotification(job) {
  const staleSending = job.status === 'sending' && Date.now() - Date.parse(job.attempt_started_at) > 60_000;
  const uncertain = job.status === 'uncertain' || job.status === 'pending' || staleSending;
  if (uncertain && !window.confirm('ยังยืนยันผลการส่งครั้งก่อนไม่ได้ กรุณาตรวจข้อความปลายทางก่อน ส่งซ้ำอาจมีข้อความซ้ำ ต้องการส่งอีกครั้งหรือไม่?')) return false;
  if (staleSending) {
    const { error } = await supabase.from('council_notification_outbox').update({ status: 'uncertain' })
      .eq('id', job.id).eq('status', 'sending').eq('attempt_started_at', job.attempt_started_at);
    if (error) throw error;
  }
  return deliverJob(job, uncertain);
}
