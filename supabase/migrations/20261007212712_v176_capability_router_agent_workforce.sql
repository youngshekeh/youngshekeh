
create table if not exists public.command_agents (
  id ÕÕ¥ÁÉ¥µÉä­äÕ±Ð¹}É¹½µ}ÕÕ¥ ¤°(ÕÍÉ}¥ÕÕ¦vBæ÷BçVÆÂ&VfW&Væ6W2WFçW6W'2BöâFVÆWFR666FRÀ¢	ÈYÙ[ÚÙ^H^Ý[[YH^Ý[ÛXZ['text not null,
  status text not null default 'ACTIVE'
  ¡¬¡ÍÑÑÕÌ¥¸ Q%Y°AUM°I¤¤°(Âv&ÆGö6VÆærFWBæ÷BçVÆÀ¢6V6²6&ÆGö6VÆÛÈ[
	ÓÐÑTIË	ÔÔÔÑIË	ÔUTÒPWÑVPÕUIÊJK[çwed_action_kinds jsonb not null default '[]'::jsonb,
  maá}½Á¹}ÍÍ¥¹µ¹ÑÌÍµ±±¥¹Ð¹½Ð¹Õ±°Õ±ÐÔ¡¬¡µâuö÷Våö76væÖVçG2&WGvVVâæBSÀ¢FW67&FöâFWBéÛÝ[Y][	ÉËÜX]YØ][Y\Ý[\Ý[Y§ault now(),
  updated_at timestamptz not null default now ¤°(Õ¹¥ÅÕ¡ÕÍÉ}¥±¹Ñ}­ä¤(¤ì()ÉÑÑ±¥¹½Ðw7G2V&Æ2æ6öÖÖæEövVçEö76væÖVçG2¢BWVB&Ö)ÞHÙ^HY][Ù[Ü[ÛWÝ]ZY

K\Ù\ÚY]ZYÝ['references auth.users(id) on delete cascade,
  agent_id uÕ¥¹½Ð¹Õ±°ÉÉ¹ÌÁÕ±¥¹½µµ¹}¹ÑÌ¡¥¤½¸±wFR666FRÀ¢'Væ&ööµöBWVBæ÷BçVÆÂ&VfW&Væ6W2V&Æ2éØÛÛ[X[Ü[ÛÚÜÊY
HÛ[]HØ\ØØYKÝ\ÚY]ZYçt null references public.command_runbook_steps(id) on delÑÍ°(Ñ¥½¹}ÉÕ¹}¥ÕÕ¥ÉÉ¹ÌÁÕ±¥¹½µµvæEö7Föå÷'Vç2BöâFVÆWFR6WBçVÆÂÀ¢76væÖVçEö¶WIÙ^Ý[Ø\X[]WØÛ\ÜÈ^Ý[ÚXÚÈ'(capability_class in ('OBSERVE','PROPOSE','REVERSIBLE_EXEUQ¤¤°(Ñ¥½¹}­¥¹ÑáÐ¹½Ð¹Õ±°°(ÍÑÑÕÌÑáÐ¹½ÐºwVÆÂFVfVÇBuTUTTBp¢6V6²7FGW2âuTUTTBrÂu%TäéÒSÉË	ÐÓÓTUIË	ÐÐÒÑQ	Ë	ÑRSQ	ÊJKÛÜ×ÛÜ\ÛÛ'not null default '{}'::jsonb,
  output jsonb not null defÕ±Ðíôèé©Í½¹°(Ù¥¹©Í½¹¹½Ð¹Õ±°Õ±Ðíôês¦§6öæ"À¢v÷fW&ææ6R§6öæ"æ÷BçVÆÂFVfVÇBw·Òs£¦§6öæ"À©ÈÛÝ\ÙWÙ[Ù\[^][\ØÛÝ[[YÙ\Ýgll default 0 check (attempt_count >= 0),
  queued_at timeÍÑµÁÑè¹½Ð¹Õ±°Õ±Ð¹½Ü ¤°(ÍÑÉÑ}ÐÑ¥µÍÑµÁÑè²p¢6ö×ÆWFVEöBFÖW7F×G¢À¢7&VFVEöBFÖW7F×G¢æ÷IÈ[Y][ÝÊ
K\]YØ][Y\Ý[\Ý[gfault now(),
  unique(user_id,assignment_key)
);

create Ñ±¥¹½Ðá¥ÍÑÌÁÕ±¥¹½µµ¹}¹Ñ}Ù¹ÑÌ (¥ÕÖvB&Ö'¶WFVfVÇBvVå÷&æFöÕ÷WVBÀ¢W6W%öBWVB	ÛÝ[Y\[Ù\È]]\Ù\ÊY
HÛ[]HØ\ØØYKggent_id uuid not null references public.command_agents(id¤½¸±ÑÍ°(ÍÍ¥¹µ¹Ñ}¥ÕÕ¥ÉÉ¹ÌÁÕ²v2æ6öÖÖæEövVçEö76væÖVçG2BöâFVÆWFR6WBçVÆÂÀ¢WiÙ[ÚÙ^H^Ý[][Ý\H^Ý[Ýg text not null default '',
  evidence jsonb not null defaÕ±Ðíôèé©Í½¹°(ÉÑ}ÐÑ¥µÍÑµÁÑè¹½Ð¹Õ±°Õ²wBæ÷r¢° ¦ÇFW"F&ÆRV&Æ2æ6öÖÖæEövVçEöWfVçG2FB9ÛÛ[[YÝ^\ÝÈ][ÚÙ^H^Â\]HXXËÛÛ[X['_agent_events
set event_key='LEGACY:'||id::text
where eve¹Ñ}­ä¥Ì¹Õ±°ì)±ÑÈÑ±ÁÕ±¥¹½µµ¹}¹Ñ}Ù¹ÑÌvÇFW"6öÇVÖâWfVçEö¶W6WBæ÷BçVÆÃ° ¦7&VFRæFWbæ÷B	Ù^\ÝÈÛÛ[X[ØYÙ[×Ý\Ù\ÜÝ]\×ÚYÛXXËÛÛ[X['_agents(user_id,status,agent_key);
create index if not ex¥ÍÑÌ½µµ¹}¹Ñ}ÍÍ¥¹µ¹ÑÍ}ÕÍÉ}ÍÑÑÕÍ}¥à(½¸ÁÕ±¦v2æ6öÖÖæEövVçEö76væÖVçG2W6W%öBÇ7FGW2ÇWFFVEöBFW9ØÊNÂÜX]H[^YÝ^\ÝÈÛÛ[X[ØYÙ[Ø\ÜÚYÛY[×çagent_idx
  on public.command_agent_assignments(user_id,a¹Ñ}¥±ÉÑ}ÐÍ¤ì)ÉÑ¥¹à¥¹½Ðá¥ÍÑÌ½µ¶væEövVçEöWfVçG5÷W6W%öG¢öâV&Æ2æ6öÖÖæEövVçEöWfVçIÜÊ\Ù\ÚYÜX]YØ]\ØÊNÂÜX]H[\]YH[^YÝ^'ists command_agent_events_user_key_uidx
  on public.comma¹}¹Ñ}Ù¹ÑÌ¡ÕÍÉ}¥±Ù¹Ñ}­ä¤ì()±ÑÈÑ±ÁÕ±¥¹vöÖÖæEövVçG2Væ&ÆR&÷rÆWfVÂ6V7W&G°¦ÇFW"F&ÆRV&ÉÚXËÛÛ[X[ØYÙ[Ø\ÜÚYÛY[È[XHÝÈ][ÙXÝ\]NÂglter table public.command_agent_events enable row level sÕÉ¥Ñäì()ÉÙ½­±°½¸ÁÕ±¥¹½µµ¹}¹ÑÌÉ½´¹½¸±wWFVçF6FVBÇ6W'f6U÷&öÆS°§&Wfö¶RÆÂöâV&Æ2æ6öÖÖæEöÙÙ[Ø\ÜÚYÛY[ÈÛH[Û]][XØ]YÙ\XÙWÜÛNÂgvoke all on public.command_agent_events from anon,authent¥Ñ±ÍÉÙ¥}É½±ì()É¹ÐÍ±Ð½¸ÁÕ±¥¹½µµ¹}ºwG2FòWFVçF6FVC°¦w&çB6VÆV7BöâV&Æ2æ6öÖÖæEövVçI×Ø\ÜÚYÛY[ÈÈ]][XØ]YÂÜ[Ù[XÝÛXXËÛÛgmand_agent_events to authenticated;

grant select,insert,ÕÁÑ½¸ÁÕ±¥¹½µµ¹}¹ÑÌÑ¼ÍÉÙ¥}É½±ì)É¹ÐÍvÆV7BÆç6W'BÇWFFRöâV&Æ2æ6öÖÖæEövVçEö76væÖVçG2FùÈÙ\XÙWÜÛNÂÜ[Ù[XÝ[Ù\ÛXXËÛÛ[X[ØYÙ[§t_events to service_role;

drop policy if exists command_¹ÑÍ}Í±Ñ}½Ý¸½¸ÁÕ±¥¹½µµ¹}¹ÑÌì)ÉÑÁ½±¥ær6öÖÖæEövVçG5÷6VÆV7Eö÷và¢öâV&Æ2æ6öÖÖæEövVçG2f÷)ÈÙ[XÝÈ]][XØ]Y\Ú[È

Ù[XÝ]]ZY

JH\È'not null and (select auth.uid())=user_id);

drop policy iá¥ÍÑÌ½µµ¹}¹Ñ}ÍÍ¥¹µ¹ÑÍ}Í±Ñ}½Ý¸½¸ÁÕ±¥¹vöÖÖæEövVçEö76væÖVçG3°¦7&VFRöÆ76öÖÖæEövVçEö79ÚYÛY[×ÜÙ[XÝÛÝÛÛXXËÛÛ[X[ØYÙ[Ø\ÜÚYÛY[ç for select to authenticated
  using ((select auth.uid())¥Ì¹½Ð¹Õ±°¹¡Í±ÐÕÑ ¹Õ¥ ¤¤õÕÍÉ}¥¤ì()É½ÀÁ½±¦v7bW7G26öÖÖæEövVçEöWfVçG5÷6VÆV7Eö÷vâöâV&Æ2æ6ùÛ[X[ØYÙ[Ù][ÎÂÜX]HÛXÞHÛÛ[X[ØYÙ[Ù][×ÜÙglect_own
  on public.command_agent_events for select to aÕÑ¡¹Ñ¥Ñ(ÕÍ¥¹ ¡Í±ÐÕÑ ¹Õ¥ ¤¤¥Ì¹½Ð¹Õ±°¹r6VÆV7BWFçVB×W6W%öB° ¦7&VFR÷"&WÆ6RgVæ7FùÛXXËÛÛ[X[ØYÙ[ÙÝX\

B]\ÈYÙÙ\[ÝXYÙH'lpgsql
security invoker
set search_path=public,pg_temp
as)¥¸(¥¹Ü¹Á¥±¥Ñå}¥±¥¹¹½Ð¥¸ =	MIY°u$õõ4RrÂu$UdU%4$ÄUôUT5UDRrFVà¢&6RW6WFöâyØYÙ[Ø\X[]HÙZ[[È^ÙYYÈMÍ]]Ü]IÎÂ[gf;
  if new.allowed_action_kinds ?| array[
    'TRADE_ORDH°Ae59P°U9}QI9MH°I9Q%1}!9°(NtT5$UEô44U52rÂtUDU$äÅô%$UdU%4$ÄRrÂtõtäU%ô$õdÂp¢	×H[Z\ÙH^Ù\[Û	ØYÙ[XÝ[ÛYÙ]ÛÛZ[È'a forbidden action kind';
  end if;
  new.updated_at=now(¤ì(ÉÑÕÉ¸¹Üì)¹ì(ì)ÉÙ½­±°½¸Õ¹Ñ¥½¸ÁÕ±¥¹vöÖÖæEövVçEöwV&Bg&öÒV&Æ2ÆæöâÆWFVçF6FVC° ¦G&ùÜYÙÙ\Y^\ÝÈÛÛ[X[ØYÙ[ÙÝX\ÝYÙÙ\ÛXXç.command_agents;
create trigger command_agent_guard_triggÈ)½É¥¹ÍÉÐ½ÈÕÁÑ½¸ÁÕ±¥¹½µµ¹}¹ÑÌ)½Èv6&÷rWV7WFRgVæ7FöâV&Æ2æ6öÖÖæEövVçEöwV&B° ¦9ÜX]HÜ\XÙH[Ý[ÛXXËÛÛ[X[ØYÙ[Ø\ÜÚYÛY['_guard()
returns trigger
language plpgsql
security invokeÈ)ÍÐÍÉ¡}ÁÑ õÁÕ±¥±Á}ÑµÀ)Ì)±É(Ù}¹ÐwV&Æ2æ6öÖÖæEövVçG2W&÷wGS°¢e÷7FWV&Æ2æ6öÖÖæE÷'YÛÛÚ×ÜÝ\É\ÝÝ\NÂÜ[È[YÙ\ÂØÙZ[[×Ü[Ègnteger;
begin
  if new.capability_class not in ('OBSERVE'°AI=A=M°IYIM%	1}aUQ¤Ñ¡¸(É¥ÍáÁÑ¥½ºrv76væÖVçB6&ÆGW6VVG2csbWF÷&Gs°¢VæBiÎÂY]ËXÝ[ÛÚÚ[[
	ÕQWÓÔTË	ÔVSQS	Ë''FUND_TRANSFER','CREDENTIAL_CHANGE',
    'SECRET_ACCESS',aQI91}%IIYIM%	1°=]9I}AAI=Y0(¤Ñ¡¸(É¦w6RW6WFöâvf÷&&FFVâ7Föâ6ææ÷B&R&÷WFVBFòvVçB	ÝÛÜÙÜÙIÎÂ[YÂÙ[XÝ
[ÈØYÙ[ÛHX§lic.command_agents
  where id=new.agent_id and user_id=neÜ¹ÕÍÉ}¥ì(¥¹½Ð½Õ¹Ñ¡¸É¥ÍáÁÑ¥½¸¹Ð½ÝºvW'6Ö6ÖF6s²VæBc°¢beövVçBç7FGW2Ãât5DdRyÈ[Z\ÙH^Ù\[Û	ØYÙ[\ÈÝXÝ]IÎÈ[YÂY§ not (v_agent.allowed_action_kinds ? new.action_kind) the¸(É¥ÍáÁÑ¥½¸¹ÐÑ¥½¸ÕÐ½Ì¹½Ð±±½ÞrF27Föâ¶æBs°¢VæBc° ¢6VÆV7B¢çFòe÷7FW ¢iÜÛHXXËÛÛ[X[Ü[ÛÚ×ÜÝ\ÂÚ\HY[]ËÝ\ÚYgnd user_id=new.user_id and runbook_id=new.runbook_id;
  i¹½Ð½Õ¹Ñ¡¸É¥ÍáÁÑ¥½¸ÉÕ¹½½¬ÍÑÀ½Ý¹ÉÍ¡¥ÀvÖ6ÖF6s²VæBc°¢be÷7FWæ6&ÆGö6Æ72ÃâæWræ6ÜX[]WØÛ\ÜÈÜÜÝ\XÝ[ÛÚÚ[]ËXÝ[ÛÚÚ['hen
    raise exception 'assignment does not match governÉÕ¹½½¬ÍÑÀì(¹¥ì((Ù}É¹¬èôÍ¹Ü¹Á¥²vGö6Æ70¢vVâtô%4U%dRrFVâvVâu$õõ4RrFVâ)ÈÚ[	ÔUTÒPWÑVPÕUIÈ[È[ÙHNH[ÂØÙZ[[§g_rank := case v_agent.capability_ceiling
    when 'OBSERYÑ¡¸ÄÝ¡¸AI=A=MÑ¡¸ÈÝ¡¸IYIM%	1}aUQrrFVâ2VÇ6RVæC°¢be÷&æ²âeö6VÆæu÷&æ²FVâ&Ú\ÙH^Ù\[Û	Ø\ÜÚYÛY[^ÙYYÈYÙ[Ø\X[]HYÙ]''; end if;

  if coalesce((new.governance->>'funds_moved'¤èé½½±¸±±Í¤(½È½±Í ¡¹Ü¹½ÙÉ¹¹´øøÑÉvFW5÷6VçBr£¦&ööÆVâÆfÇ6R¢÷"6öÆW66RæWræv÷fW&æéØÙKOØÜY[X[×ØÚ[ÙY	ÊNÛÛX[[ÙJBÜÛØ[gsce((new.governance->>'secret_accessed')::boolean,false)
½È½±Í ¡¹Ü¹½ÙÉ¹¹´øøáÑÉ¹±}¥ÉÉÙÉÍ¥±uö7Föâr£¦&ööÆVâÆfÇ6R¢÷"6öÆW66RæWræv÷fW&ææ9ÙKOÙ^\[ÙYXÝÉÊNÛÛX[[ÙJB[Z\ÙH'exception 'V176 assignment violates hard governance boundÉäì(¹¥ì((¹Ü¹ÕÁÑ}Ðõ¹½Ü ¤ì(ÉÑÕÉ¸¹Üì)ºvC°¢BC°§&Wfö¶RÆÂöâgVæ7FöâV&Æ2æ6öÖÖæEövVçEö76véÛY[ÙÝX\

HÛHXXË[Û]][XØ]YÂÜYÙÙgr if exists command_agent_assignment_guard_trigger on pub±¥¹½µµ¹}¹Ñ}ÍÍ¥¹µ¹ÑÌì)ÉÑÑÉ¥È½µµ¹}vçEö76væÖVçEöwV&E÷G&vvW ¦&Vf÷&Rç6W'B÷"WFFRöâYØXËÛÛ[X[ØYÙ[Ø\ÜÚYÛY[ÂÜXXÚÝÈ^XÝ]H[Ý'ion public.command_agent_assignment_guard();
