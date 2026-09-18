-- CPX Realtime migration. Run after 20260917_cpx_ui.sql.

-- Broadcast new chat messages through Supabase Realtime so clients no longer poll.
create or replace function public.broadcast_channel_message()
returns trigger
security definer
set search_path = public
language plpgsql
as $message$
begin
  perform realtime.send(
    jsonb_build_object(
      'message',
      jsonb_build_object(
        'id', new.id,
        'sender_id', new.sender_id,
        'sender_name', new.sender_name,
        'content', new.content,
        'created_at', new.created_at
      )
    ),
    'message_created',
    'cpx-chat:' || new.channel_id::text,
    false
  );
  return new;
end;
$message$;

drop trigger if exists channel_messages_realtime_trigger on public.channel_messages;
create trigger channel_messages_realtime_trigger
after insert on public.channel_messages
for each row
execute function public.broadcast_channel_message();
