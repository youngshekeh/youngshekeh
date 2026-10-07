
create table if not exists public.command_executive_cyclÌ (¥ÕÕ¥ÁÉ¥µÉä­äÕ±Ð¹}É¹½µ}ÕÕ¥ ¤°(Öw6W%öBWVBæ÷BçVÆÂFVfVÇBWFçVB&VfW&Væ6W2WFçYÜÙ\ÊY
HÛ[]HØ\ØØYKÞXÛWÙ]H]HÝ[' version text not null default 'V173',
  state_fingerprinÐÑáÐ¹½Ð¹Õ±°°(Í½ÙÉ¥¹}Ñ¥½¸ÑáÐ¹½Ð¹Õ±°Õ±ÒrutBrÀ¢6FÅ÷W&Ö76öâFWBæ÷BçVÆÂFVfVÇBs"rÉÂXXÚ[WÚX[ÜÝÛX[[Ý[Y][ÚXÚÈ
'machine_health_pct between 0 and 100),
  focus_score smal±¥¹Ð¹½Ð¹Õ±°Õ±ÐÀ¡¬¡½ÕÍ}Í½ÉÑÝ¸À¹sÀ¢7VÖÖ'FWBæ÷BçVÆÂFVfVÇBrrÀ¢æöÖÆW2§6ùÛÝ[Y][	Ö×IÎÛÛ[\[[ÛÈÛÛçt null default '[]'::jsonb,
  reallocation_suggestions js½¹¹½Ð¹Õ±°Õ±Ðmtèé©Í½¹°(¡Õµ¹}¥Í¥½¹Ì©Í½¹ræ÷BçVÆÂFVfVÇBuµÒs£¦§6öæ"À¢6÷W&6U÷6æ6÷B§6öæ"æùÝ[Y][	ÞßIÎÛÛÙ[\][ÛØÛÝ[[YÙ\çt null default 1 check (generation_count >= 1),
  first_g¹ÉÑ}ÐÑ¥µÍÑµÁÑè¹½Ð¹Õ±°Õ±Ð¹½Ü ¤°(¹ÉÒvVEöBFÖW7F×G¢æ÷BçVÆÂFVfVÇBæ÷rÀ¢WFFVEöBFÛY\Ý[\Ý[Y][ÝÊ
K[\]YJ\Ù\ÚYÞXÛWçdate)
);
create index if not exists command_executive_cyc±Í}ÕÍÉ}Ñ}¥à(½¸ÁÕ±¥¹½µµ¹}áÕÑ¥Ù}å±Ì¡ÕÎvW%öBÆ76ÆUöFFRFW62°¦ÇFW"F&ÆRV&Æ2æ6öÖÖæEöWV7WIÚ]WØÞXÛ\È[XHÝÈ][ÙXÝ\]NÂ]ÚÙH[][Yçes on table public.command_executive_cycles from anon,aut¡¹Ñ¥Ñ±ÍÉÙ¥}É½±ì)É¹ÐÍ±Ð±¥¹ÍÉÐ±ÕÁÑ½¸Ñv&ÆRV&Æ2æ6öÖÖæEöWV7WFfUö76ÆW2FòWFVçF6FVC°¦w&ÛÙ[XÝ[Ù\\]HÛXHXXËÛÛ[X[Ù^XÝ]]g_cycles to service_role;
drop policy if exists command_exÕÑ¥Ù}å±Í}Í±Ñ}½Ý¸½¸ÁÕ±¥¹½µµ¹}áÕÑ¥Ù}åvÆW3°¦G&÷öÆ7bW7G26öÖÖæEöWV7WFfUö76ÆW5öç6W)ÝÛÝÛÛXXËÛÛ[X[Ù^XÝ]]WØÞXÛ\ÎÂÜÛXÞHY'exists command_executive_cycles_update_own on public.comm¹}áÕÑ¥Ù}å±Ìì)É½ÀÁ½±¥ä¥á¥ÍÑÌ½µµ¹}áÖwFfUö76ÆW5öFVÆWFUö÷vâöâV&Æ2æ6öÖÖæEöWV7WFfUö76ÆW9ÎÂÜX]HÛXÞHÛÛ[X[Ù^XÝ]]WØÞXÛ\×ÜÙ[XÝÛÝÛÛgblic.command_executive_cycles
  for select to authenticatÕÍ¥¹ ¡Í±ÐÕÑ ¹Õ¥ ¤¤¥Ì¹½Ð¹Õ±°¹¡Í±ÐÕÒvçVB×W6W%öB°¦7&VFRöÆ76öÖÖæEöWV7WFfUö76ÆW9×Ú[Ù\ÛÝÛÛXXËÛÛ[X[Ù^XÝ]]WØÞXÛ\ÂÜ[Ùgrt to authenticated with check ((select auth.uid()) is noÐ¹Õ±°¹¡Í±ÐÕÑ ¹Õ¥ ¤¤õÕÍÉ}¥¤ì)ÉÑÁ½±¥ä¾vÖÖæEöWV7WFfUö76ÆW5÷WFFUö÷vâöâV&Æ2æ6öÖÖæEöWV7YÝ]WØÞXÛ\ÂÜ\]HÈ]][XØ]Y\Ú[È

Ù[Xçt auth.uid()) is not null and (select auth.uid())=user_id¤(Ý¥Ñ ¡¬ ¡Í±ÐÕÑ ¹Õ¥ ¤¤¥Ì¹½Ð¹Õ±°¹¡Í±v7BWFçVB×W6W%öB° ¦7&VFRF&ÆRbæ÷BW7G2V&ÉÚXËÛÛ[X[Ú[\[[ÛÈ
Y]ZY[X\HÙ^HY]['gen_random_uuid(),
  user_id uuid not null references aut ¹ÕÍÉÌ¡¥¤½¸±ÑÍ°(¥¹ÑÉÙ¹Ñ¥½¹}­äÑáÐ¹¾wBçVÆÂÀ¢6÷W&6RFWBæ÷BçVÆÂFVfVÇBtUT5UDdUô54ÄRrÉÂÛÝ\ÙWØÞXÛWÙ]H]KÛÝ\ÙWÙ[Ù\[^çource_code text,
  title text not null,
  summary text noÐ¹Õ±°Õ±Ð°(É½µµ¹}Ñ¥½¸ÑáÐ¹½Ð¹Õ±°vVÇBrrÀ¢6FVv÷'FWBæ÷BçVÆÂFVfVÇBtõU$DärrÀ¢	ÜÙ]\]HÛX[[Ý[Y][LÚXÚÈ
Ù]\]H]'ween 0 and 100),
  priority smallint not null default 50 ¡¬¡ÁÉ¥½É¥ÑäÑÝ¸À¹ÄÀÀ¤°(ÁÁÉ½Ù±}ÉÅÕ¥ÉvööÆVâæ÷BçVÆÂFVfVÇBfÇ6RÀ¢7FGW2FWBæ÷BçVÆÂFViØ][	ÓUÉÂÚXÚÈ
Ý]\È[
	ÓUÉË	ÐPÒÓÕÓQÑQ	Ë	ÐT'PROVED','DEFERRED','EXECUTING','RESOLVED','LEARNED')),
  ½Ý¹É}É½±ÑáÐ¹½Ð¹Õ±°Õ±ÐI!%QQ}MQ]I°(wVUöBFÖW7F×G¢À¢FVfW'&VE÷VçFÂFÖW7F×G¢À¢WfFVéØÙHÛÛÝ[Y][	ÞßIÎÛÛ\ÛÛ][ÛÛÝH'text not null default '',
  lesson text not null default °(½ÕÉÉ¹}½Õ¹Ð¥¹ÑÈ¹½Ð¹Õ±°Õ±ÐÄ¡¬¢vö67W'&Væ6Uö6÷VçBãÒÀ¢f'7E÷6VVåöBFÖW7F×G¢æ÷BéÝ[Y][ÝÊ
K\ÝÜÙY[Ø][Y\Ý[\Ý[gfault now(),
  acknowledged_at timestamptz,
  approved_atÑ¥µÍÑµÁÑè°(áÕÑ¥¹}ÐÑ¥µÍÑµÁÑè°(ÉÍ½±Ù}ÐÒvÖW7F×G¢À¢ÆV&æVEöBFÖW7F×G¢À¢7&VFVEöBFÖW7IØ[\Ý[Y][ÝÊ
K\]YØ][Y\Ý[\çt null default now(),
  signal_active boolean not null deÕ±ÐÑÉÕ°(±É}ÐÑ¥µÍÑµÁÑè°(Õ¹¥ÅÕ¡ÕÍÉ}¥±¥ºwFW'fVçFöåö¶W¢°¦ÇFW"F&ÆRV&Æ2æ6öÖÖæEöçFW'fVçFùÛÈYÛÛ[[YÝ^\ÝÈÚYÛ[ØXÝ]HÛÛX[Ý['l default true;
alter table public.command_interventions ½±Õµ¸¥¹½Ðá¥ÍÑÌ±É}ÐÑ¥µÍÑµÁÑèì)ÉÑ¦væFWbæ÷BW7G26öÖÖæEöçFW'fVçFöç5÷W6W%÷7FGW5öG©ÈÛXXËÛÛ[X[Ú[\[[ÛÊ\Ù\ÚYÝ]\Ë[Ü]g desc,updated_at desc);
create index if not exists comman}¥¹ÑÉÙ¹Ñ¥½¹Í}ÕÍÉ}Õ}¥à(½¸ÁÕ±¥¹½µµ¹}¥¹ÑÉÙºwFöç2W6W%öBÆGVUöB¢vW&R7FGW2æ÷Bâu$U4ôÅdTBrÂyÓPTQ	ÊNÂÜX]H[^YÝ^\ÝÈÛÛ[X[Ú[\[[çns_user_signal_idx
  on public.command_interventions(user}¥±Í¥¹±}Ñ¥Ù±ÁÉ¥½É¥ÑäÍ±ÕÁÑ}ÐÍ¤ì()ÉÑrF&ÆRbæ÷BW7G2V&Æ2æ6öÖÖæEöçFW'fVçFöåöWfVçG2ÂY]ZY[X\HÙ^HY][Ù[Ü[ÛWÝ]ZY

K\Ù\çid uuid not null references auth.users(id) on delete casc°(¥¹ÑÉÙ¹Ñ¥½¹}¥ÕÕ¥¹½Ð¹Õ±°ÉÉ¹ÌÁÕ±¥¹¾vÖÖæEöçFW'fVçFöç2BöâFVÆWFR666FRÀ¢WfVçE÷GRIÙ^Ý[ÛWÜÝ]\È^×ÜÝ]\È^XÝ'or text not null default 'OWNER' check (actor in ('SYSTEM°=]9H¤¤°(¹½ÑÑáÐ¹½Ð¹Õ±°Õ±Ð°(Ù¥¹v§6öæ"æ÷BçVÆÂFVfVÇBw·Òs£¦§6öæ"À¢7&VFVEöBFÖW7FÙÜÝ[Y][ÝÊ
BNÂÜX]H[^YÝ^\ÝÈ'command_intervention_events_user_intervention_idx
  on pu±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹}Ù¹ÑÌ¡ÕÍÉ}¥±¥¹ÑÉÙ¹Ñ¥½¹}¥²v7&VFVEöBFW62° ¦ÇFW"F&ÆRV&Æ2æ6öÖÖæEöçFW'fVçFùÛÈ[XHÝÈ][ÙXÝ\]NÂ[\XHXXËÛÛ[X[çintervention_events enable row level security;
revoke allÁÉ¥Ù¥±Ì½¸Ñ±ÁÕ±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹ÌÉ½´ºvöâÆWFVçF6FVBÇ6W'f6U÷&öÆS°§&Wfö¶RÆÂ&fÆVvW2öâIØXHXXËÛÛ[X[Ú[\[[ÛÙ][ÈÛH[Û]]['icated,service_role;
grant select,insert,update on table ÁÕ±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹ÌÑ¼ÕÑ¡¹Ñ¥Ñì)É¹ÐÍ±v7BÆç6W'BöâF&ÆRV&Æ2æ6öÖÖæEöçFW'fVçFöåöWfVçG2Fò	Ø]][XØ]YÂÜ[Ù[XÝ[Ù\\]HÛXHXXç.command_interventions to service_role;
grant select,inseÉÐ½¸Ñ±ÁÕ±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹}Ù¹ÑÌÑ¼ÍÉÙ¥u÷&öÆS° ¦G&÷öÆ7bW7G26öÖÖæEöçFW'fVçFöç5÷6VÆV9ÝÛÝÛÛXXËÛÛ[X[Ú[\[[ÛÎÂÜÛXÞHY^gsts command_interventions_insert_own on public.command_inÑÉÙ¹Ñ¥½¹Ìì)É½ÀÁ½±¥ä¥á¥ÍÑÌ½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹Í~wWFFUö÷vâöâV&Æ2æ6öÖÖæEöçFW'fVçFöç3°¦G&÷öÆ7Ù^\ÝÈÛÛ[X[Ú[\[[Û×Ù[]WÛÝÛÛXXËÛÛ[Xgnd_interventions;
create policy command_interventions_selÑ}½Ý¸½¸ÁÕ±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹Ì(½ÈÍ±ÐÑ¼wWFVçF6FVBW6ær6VÆV7BWFçVB2æ÷BçVÆÂæBÜÙ[XÝ]]ZY

JO]\Ù\ÚY
NÂÜX]HÛXÞHÛÛ[X[Ú[\§entions_insert_own on public.command_interventions
  for ¥¹ÍÉÐÑ¼ÕÑ¡¹Ñ¥ÑÝ¥Ñ ¡¬ ¡Í±ÐÕÑ ¹Õ¥ ¤¤¦w2æ÷BçVÆÂæB6VÆV7BWFçVB×W6W%öB°¦7&VFRöÆ9ÞHÛÛ[X[Ú[\[[Û×Ý\]WÛÝÛÛXXËÛÛ[X[Ú[grventions
  for update to authenticated
  using ((select ÕÑ ¹Õ¥ ¤¤¥Ì¹½Ð¹Õ±°¹¡Í±ÐÕÑ ¹Õ¥ ¤¤õÕÍÉ}¥¤*rvF6V6²6VÆV7BWFçVB2æ÷BçVÆÂæB6VÆV7IÈ]]ZY

JO]\Ù\ÚY
NÂÜÛXÞHY^\ÝÈÛÛ[X[Ú['ervention_events_select_own on public.command_interventio¹}Ù¹ÑÌì)É½ÀÁ½±¥ä¥á¥ÍÑÌ½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹}ÙºwG5öç6W'Eö÷vâöâV&Æ2æ6öÖÖæEöçFW'fVçFöåöWfVçG3°¦7&VÝHÛXÞHÛÛ[X[Ú[\[[ÛÙ][×ÜÙ[XÝÛÝÛÛXgc.command_intervention_events
  for select to authenticatÕÍ¥¹ ¡Í±ÐÕÑ ¹Õ¥ ¤¤¥Ì¹½Ð¹Õ±°¹¡Í±ÐÕÒvçVB×W6W%öB°¦7&VFRöÆ76öÖÖæEöçFW'fVçFöåöWfYÛ×Ú[Ù\ÛÝÛÛXXËÛÛ[X[Ú[\[[ÛÙ][Âçr insert to authenticated with check (
    (select auth.u¥ ¤¤¥Ì¹½Ð¹Õ±°(¹¡Í±ÐÕÑ ¹Õ¥ ¤¤õÕÍÉ}¥(ræBW7G2¢6VÆV7Bg&öÒV&Æ2æ6öÖÖæEöçFW'fVéÝ[ÛÈBÚ\HKYZ[\[[ÛÚY[K\Ù\ÚYJçelect auth.uid())
    )
  );

create or replace function ÁÕ±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹}ÕÉ ¤)ÉÑÕÉ¹ÌÑÉ¥È)±¹ÖvvRÇw7À§6V7W&Gçfö¶W §6WB6V&6÷F×V&Æ2Çu÷FYÛ\\È		XÛ\H[ÝÙYÛÛX[H[ÙNÂYÚ[Y]ç.user_id is distinct from old.user_id then
    raise exceÁÑ¥½¸¥¹ÑÉÙ¹Ñ¥½¸½Ý¹ÉÍ¡¥À¹¹½Ð¡¹ì(¹¦vc°¢bæWrç7FGW22F7Fæ7Bg&öÒöÆBç7FGW2FVà¢ÛÝÙYHØ\ÙHÛÝ]\ÂÚ[	ÓUÉÈ[]ËÝ]gs in ('ACKNOWLEDGED','DEFERRED')
      when 'ACKNOWLEDGEDÑ¡¸¹Ü¹ÍÑÑÕÌ¥¸ AAI=Y°II°IM=1Y¤(rvVât$õdTBrFVâæWrç7FGW2âtUT5UDärrÂtDTiÑTQ	Ë	ÔTÓÓQ	ÊBÚ[	ÑQTQ	È[]ËÝ]\È'in ('ACKNOWLEDGED','RESOLVED')
      when 'EXECUTING' the¸¹Ü¹ÍÑÑÕÌ¥¸ IM=1Y°II¤(Ý¡¸IM=2udTBrFVâæWrç7FGW2âtÄT$äTBrÂtäUrr¢vVâtÄTÔQ	È[]ËÝ]\ÏIÓUÉÂ[ÙH[ÙB[Â' if not allowed then raise exception 'invalid interventio¸ÑÉ¹Í¥Ñ¥½¸è´ø±½±¹ÍÑÑÕÌ±¹Ü¹ÍÑÑÕÌì¹¥ì(vbæWrç7FGW3Òt4´äõtÄTDtTBræBæWræ6¶æ÷vÆVFvVEöB2éÝ[[]ËXÚÛÝÛYÙYØ][ÝÊ
NÈ[YÂY]ËÝ'atus='APPROVED' and new.approved_at is null then new.appr½Ù}Ðõ¹½Ü ¤ì¹¥ì(¥¹Ü¹ÍÑÑÕÌôaUQ%9¹væWræWV7WFæuöB2çVÆÂFVâæWræWV7WFæuöCÖæ÷r²VæIÈYÂY]ËÝ]\ÏIÔTÓÓQ	È[]Ë\ÛÛYØ]\È'null then new.resolved_at=now(); end if;
    if new.statuÌô1I9¹¹Ü¹±É¹}Ð¥Ì¹Õ±°Ñ¡¸¹Ü¹±É¹}wCÖæ÷r²VæBc°¢bæWrç7FGW3ÒtäUrrFVà¢æWræØÚÛÝÛYÙYØ][[È]Ë\ÝYØ][[È]Ë^XÝ][×çat=null;
      new.resolved_at=null; new.learned_at=null;¹Ü¹ÉÉ}Õ¹Ñ¥°õ¹Õ±°ì(¹¥ì(¹¥ì(¹Ü¹ÕÁvFVEöCÖæ÷r°¢&WGW&âæWs°¦VæC°¢BC°§&Wfö¶RÆÂöâgVæ7IÚ[ÛXXËÛÛ[X[Ú[\[[ÛÙÝX\

HÛHXXË[Û'authenticated;
drop trigger if exists command_interventio¹}ÕÉ}ÑÉ¥È½¸ÁÕ±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹Ìì)ÉÑÒw&vvW"6öÖÖæEöçFW'fVçFöåöwV&E÷G&vvW ¦&Vf÷&RWFFRùÛXXËÛÛ[X[Ú[\[[ÛÂÜXXÚÝÈ^XÝ]H[Ý'ion public.command_intervention_guard();

create or replaÕ¹Ñ¥½¸ÁÕ±¥¹½µµ¹}ÑÉ¹Í¥Ñ¥½¹}¥¹ÑÉÙ¹Ñ¥½¸ (Á}¦vçFW'fVçFöåöBWVBÇ÷Fõ÷7FGW2FWBÇöæ÷FRFWBFVfVÇB	ÉÉÂB]\ÈÛÛ[ÝXYÙHÜÜ[ÙXÝ\]H[ÚÙ\Ù]'search_path=public,pg_temp
as $$
declare
  v_current publ¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹ÌÉ½ÝÑåÁì(Ù}ÕÁÑÁÕ±¥¹½µ¶væEöçFW'fVçFöç2W&÷wGS°¢e÷VBWVB£Ò6VÆV7BWFçYÚY

JNÂYÚ[YÝZY\È[[Z\ÙH^Ù\[Û	Ø]]'hentication required'; end if;
  select * into v_current É½´ÁÕ±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹Ì(Ý¡É¥õÁ}¥¹ÑÉÙºwFöåöBæBW6W%öC×e÷VBf÷"WFFS°¢bæ÷Bf÷VæBFVéÈZ\ÙH^Ù\[Û	Ú[\[[ÛÝÝ[	ÎÈ[YÂ\gte public.command_interventions
  set status=p_to_status,(ÉÍ½±ÕÑ¥½¹}¹½ÑõÍÝ¡¸Á}Ñ½}ÍÑÑÕÌôIM=1YÒvVâ6öÆW66Röæ÷FRÂrrVÇ6R&W6öÇWFöåöæ÷FRVæBÀ¢ÉÙ\ÜÛÛXØ\ÙHÚ[Ý×ÜÝ]\ÏIÓPTQ	È[ÛØ[\ØÙJÛÝ'e,'') else lesson end
  where id=p_intervention_id and usÉ}¥õÙ}Õ¥(ÉÑÕÉ¹¥¹¨¥¹Ñ¼Ù}ÕÁÑì(¥¹ÍÉÐ¥¹Ñ¼ÂwV&Æ2æ6öÖÖæEöçFW'fVçFöåöWfVçG2¢W6W%öBÆçFW'fVçFÛÛÚY][Ý\KÛWÜÝ]\Ë×ÜÝ]\ËXÝÜÝK]Y[çe
  ) values (
    v_uid,p_intervention_id,'STATUS_TRANSIQ%=8±Ù}ÕÉÉ¹Ð¹ÍÑÑÕÌ±Ù}ÕÁÑ¹ÍÑÑÕÌ°(=]9H±½²vW66Röæ÷FRÂrrÆ§6öæ%ö'VÆEöö&¦V7B¢w6÷W&6UöfævW'	Ü[	ËÝ\]YÛÝ\ÙWÙ[Ù\[	ÜÛÝ\ÙWØÛÙIË§_updated.source_code,
      'signal_active',v_updated.sig¹±}Ñ¥Ù(¤(¤ì(ÉÑÕÉ¸Ñ½}©Í½¹¡Ù}ÕÁÑ¤ì)¹ì*rBC°§&Wfö¶RÆÂöâgVæ7FöâV&Æ2æ6öÖÖæE÷G&ç6FöåöçFYÜ[[Û]ZY^^
HÛHXXË[ÛÂÜ[^XÝ]H'on function public.command_transition_intervention(uuid,táÐ±ÑáÐ¤Ñ¼ÕÑ¡¹Ñ¥Ñì()ÉÑÑ±¥¹½Ðá¥ÍÑÌÂwV&Æ2æ6öÖÖæE÷'Væ&öö·2¢BWVB&Ö'¶WFVfVÇBvYÛÜ[ÛWÝ]ZY

K\Ù\ÚY]ZYÝ[Y\[Ù\È]]§users(id) on delete cascade,
  intervention_id uuid not nÕ±°ÉÉ¹ÌÁÕ±¥¹½µµ¹}¥¹ÑÉÙ¹Ñ¥½¹Ì¡¥¤½¸±Ñr666FRÀ¢'Væ&ööµö¶WFWBæ÷BçVÆÂÀ¢FFÆRFWBæ÷BéÝ[ØXÝ]H^Ý[Y][	ÉËÝ]\È^'not null default 'DRAFT'
    check (status in ('DRAFT','Rd°AAI=Y°IU99%9°	1=-°=5A1Q°911tBrÀ¢6&ÆGö6VÆærFWBæ÷BçVÆÂFVfVÇBu$õõ4YÉÂÚXÚÈ
Ø\X[]WØÙZ[[È[
	ÓÐÑTIË	ÔÔÔÑIË	çREVERSIBLE_EXECUTE','HUMAN_APPROVAL_REQUIRED','FORBIDDEN'¤¤°(ÁÁÉ½Ù±}ÉÅÕ¥É½½±¸¹½Ð¹Õ±°Õ±Ð±Í°(r&÷fVEöBFÖW7F×G¢À¢&÷fÅöæ÷FRFWBæ÷BçVÆÂIÙY][	ÉËÛÝ\ÙWÙ[Ù\[^\Ú[Û[YÙ\§ot null default 1 check (version>=1),
  preconditions jso¹¹½Ð¹Õ±°Õ±Ðmtèé©Í½¹°(É½±±­}Á±¸©Í½¹¹¾wBçVÆÂFVfVÇBuµÒs£¦§6öæ"À¢WfFVæ6U÷&WV&VÖVçG2§6öæ)ÈÝ[Y][	Ö×IÎÛÛÙ[\]YØH^Ýgll default 'SYSTEM' check (generated_by in ('SYSTEM','OWNH¤¤°(ÉÑ}ÐÑ¥µÍÑµÁÑè¹½Ð¹Õ±°Õ±Ð¹½Ü ¤°(rWFFVEöBFÖW7F×G¢æ÷BçVÆÂFVfVÇBæ÷rÀ¢VæVRÝ\Ù\ÚY[ÛÚ×ÚÙ^JBNÂÜX]HXHYÝ^\ÝÈXXç.command_runbook_steps (
  id uuid primary key default ge¹}É¹½µ}ÕÕ¥ ¤°(ÕÍÉ}¥ÕÕ¥¹½Ð¹Õ±°ÉÉ¹ÌÕÑ ºwW6W'2BöâFVÆWFR666FRÀ¢'Væ&ööµöBWVBæ÷BçVÆÂ)ÙY\[Ù\ÈXXËÛÛ[X[Ü[ÛÚÜÊY
HÛ[]HØ\ØØYK§  step_key text not null,
  position smallint not null ch¬¡Á½Í¥Ñ¥½¸ÑÝ¸Ä¹ää¤°(Ñ¥Ñ±ÑáÐ¹½Ð¹Õ±°°(rFW67&FöâFWBæ÷BçVÆÂFVfVÇBrrÀ¢6&ÆGö6Æ79È^Ý[ÚXÚÈ
Ø\X[]WØÛ\ÜÈ[
	ÓÐÑTIË''PROPOSE','REVERSIBLE_EXECUTE','HUMAN_APPROVAL_REQUIRED',=I	%8¤¤°(Ñ¥½¹}­¥¹ÑáÐ¹½Ð¹Õ±°°(ÍÑÑÕÌÑáÒræ÷BçVÆÂFVfVÇBuTäDärp¢6V6²7FGW2âuTäDéÑÉË	ÔPQIË	ÔSSÉË	ÔÕPÐÑQQQ	Ë	ÑRSQ	Ë	ÐÐÒÑQ	Ë	ÔÒÒT'PED')),
  auto_executable boolean not null default false,(ÉÅÕ¥ÉÍ}½Ý¹É}ÁÁÉ½Ù°½½±¸¹½Ð¹Õ±°Õ±Ð±ÍrÀ¢&×2§6öæ"æ÷BçVÆÂFVfVÇBw·Òs£¦§6öæ"À¢&V6öæFÝ[ÛÈÛÛÝ[Y][	Ö×IÎÛÛÛXÚ×Ü[§ jsonb not null default '[]'::jsonb,
  evidence jsonb not¹Õ±°Õ±Ðíôèé©Í½¹°(±ÍÑ}Í½ÕÉ}¥¹ÉÁÉ¥¹ÐÑáÒrÀ¢GFV×Eö6÷VçBçFVvW"æ÷BçVÆÂFVfVÇB6V6²GFVÙÜØÛÝ[L
KÝ\YØ][Y\Ý[\ÛÛ\]YØ]gmestamptz,
  created_at timestamptz not null default now(¤°(ÕÁÑ}ÐÑ¥µÍÑµÁÑè¹½Ð¹Õ±°Õ±Ð¹½Ü ¤°(Õ¹¦wVR'Væ&ööµöBÇ7FWö¶W¢°¦7&VFRF&ÆRbæ÷BW7G2YØXËÛÛ[X[ØXÝ[ÛÜ[È
Y]ZY[X\HÙ^HY]['gen_random_uuid(),
  user_id uuid not null references aut ¹ÕÍÉÌ¡¥¤½¸±ÑÍ°(ÉÕ¹½½­}¥ÕÕ¥¹½Ð¹Õ±²r&VfW&Væ6W2V&Æ2æ6öÖÖæE÷'Væ&öö·2BöâFVÆWFR666FYËÝ\ÚY]ZYÝ[Y\[Ù\ÈXXËÛÛ[X[Ü[çok_steps(id) on delete cascade,
  run_key text not null,
µ½ÑáÐ¹½Ð¹Õ±°¡¬¡µ½¥¸ UQ<°=]9I}AAI=ZtTBrÂtE%õ%TârÀ¢6&ÆGö6Æ72FWBæ÷BçVÆÀ¢6YØÚÈ
Ø\X[]WØÛ\ÜÈ[
	ÓÐÑTIË	ÔÔÔÑIË	ÔUTÒPWçEXECUTE','HUMAN_APPROVAL_REQUIRED','FORBIDDEN')),
  actio¹}­¥¹ÑáÐ¹½Ð¹Õ±°°(ÍÑÑÕÌÑáÐ¹½Ð¹Õ±°¡¬¡ÍÑÑÖw2âu5D%DTBrÂu5T44TTDTBrÂtdÄTBrÂt$Äô4´TBrÀ¢çWIÈÛÛÝ[Y][	ÞßIÎÛÛÝ]]ÛÛÝ§ull default '{}'::jsonb,
  evidence jsonb not null defaulÐíôèé©Í½¹°(½ÙÉ¹¹©Í½¹¹½Ð¹Õ±°Õ±Ðíôèêv§6öæ"À¢W'&÷"FWBæ÷BçVÆÂFVfVÇBrrÀ¢7F'FVEöBFÙÙ\Ý[\Ý[Y][ÝÊ
KÛÛ\]YØ][Y\Ý[\'tz,
  created_at timestamptz not null default now(),
  un¥ÅÕ¡ÕÍÉ}¥±ÉÕ¹}­ä¤(¤ì)ÉÑÑ±¥¹½Ðá¥ÍÑÌÁÕ±¦v2æ6öÖÖæEö7FöåöWfVçG2¢BWVB&Ö'¶WFVfVÇByÙ[Ü[ÛWÝ]ZY

K\Ù\ÚY]ZYÝ[Y\[Ù\È]]'.users(id) on delete cascade,
  runbook_id uuid not null ÉÉ¹ÌÁÕ±¥¹½µµ¹}ÉÕ¹½½­Ì¡¥¤½¸±ÑÍ²p¢7FWöBWVB&VfW&Væ6W2V&Æ2æ6öÖÖæE÷'Væ&ööµ÷7FW2Ù
HÛ[]HÙ][XÝ[ÛÜ[ÚY]ZYY\[Ù\Ègblic.command_action_runs(id) on delete set null,
  event_ÑåÁÑáÐ¹½Ð¹Õ±°°(Ñ½ÈÑáÐ¹½Ð¹Õ±°¡¬¡Ñ½È¥ºru55DTÒrÂtõtäU"rÀ¢æ÷FRFWBæ÷BçVÆÂFVfVÇBrrÀ¢	Ù]Y[ÙHÛÛÝ[Y][	ÞßIÎÛÛÜX]YØ]' timestamptz not null default now()
);
create index if noÐá¥ÍÑÌ½µµ¹}ÉÕ¹½½­Í}ÕÍÉ}ÍÑÑÕÍ}¥à½¸ÁÕ±¥¹½µµvæE÷'Væ&öö·2W6W%öBÇ7FGW2ÇWFFVEöBFW62°¦7&VFRæFWÈYÝ^\ÝÈÛÛ[X[Ü[ÛÚ×ÜÝ\×Ü[ÛÚ×ÚYÛXgc.command_runbook_steps(user_id,runbook_id,position);
creÑ¥¹à¥¹½Ðá¥ÍÑÌ½µµ¹}Ñ¥½¹}ÉÕ¹Í}ÕÍÉ}¥à½¸ÂwV&Æ2æ6öÖÖæEö7Föå÷'Vç2W6W%öBÆ7&VFVEöBFW62°¦7&VIÙH[^YÝ^\ÝÈÛÛ[X[ØXÝ[ÛÙ][×Ý\Ù\ÚYÛ'ublic.command_action_events(user_id,created_at desc);

alÑÈÑ±ÁÕ±¥¹½µµ¹}ÉÕ¹½½­Ì¹±É½Ü±Ù°ÍÕÉ¦wG°¦ÇFW"F&ÆRV&Æ2æ6öÖÖæE÷'Væ&ööµ÷7FW2Væ&ÆR&÷rÉÙ][ÙXÝ\]NÂ[\XHXXËÛÛ[X[ØXÝ[ÛÜ[È[gble row level security;
alter table public.command_action}Ù¹ÑÌ¹±É½Ü±Ù°ÍÕÉ¥Ñäì)ÉÙ½­±°½¸ÁÕ±¥¹vöÖÖæE÷'Væ&öö·2g&öÒæöâÆWFVçF6FVBÇ6W'f6U÷&öÆS°§&WiÛÚÙH[ÛXXËÛÛ[X[Ü[ÛÚ×ÜÝ\ÈÛH[Û]]['icated,service_role;
revoke all on public.command_action_ÉÕ¹ÌÉ½´¹½¸±ÕÑ¡¹Ñ¥Ñ±ÍÉÙ¥}É½±ì)ÉÙ½­±°½¸wV&Æ2æ6öÖÖæEö7FöåöWfVçG2g&öÒæöâÆWFVçF6FVBÇ6W'iÚXÙWÜÛNÂÜ[Ù[XÝ\]HÛXXËÛÛ[X[Ü[ÛÚÜÈ'to authenticated;
grant select on public.command_runbook_ÍÑÁÌÑ¼ÕÑ¡¹Ñ¥Ñì)É¹ÐÍ±Ð½¸ÁÕ±¥¹½µµ¹}wFöå÷'Vç2FòWFVçF6FVC°¦w&çB6VÆV7BÆç6W'BöâV&Æ9ËÛÛ[X[ØXÝ[ÛÙ][ÈÈ]][XØ]YÂÜ[Ù[XÝ[çert,update on public.command_runbooks to service_role;
gr¹ÐÍ±Ð±¥¹ÍÉÐ±ÕÁÑ½¸ÁÕ±¥¹½µµ¹}ÉÕ¹½½­}ÍÑÁÌwFò6W'f6U÷&öÆS°¦w&çB6VÆV7BÆç6W'BöâV&Æ2æ6öÖÖæEö9Ý[ÛÜ[ÈÈÙ\XÙWÜÛNÂÜ[Ù[XÝ[Ù\ÛXXË§command_action_events to service_role;

drop policy if ex¥ÍÑÌ½µµ¹}ÉÕ¹½½­Í}Í±Ñ}½Ý¸½¸ÁÕ±¥¹½µµ¹}ÉÕ¹½¾v·3°¦G&÷öÆ7bW7G26öÖÖæE÷'Væ&öö·5÷WFFUö÷vâöâ	ÜXXËÛÛ[X[Ü[ÛÚÜÎÂÜX]HÛXÞHÛÛ[X[Ü[ÛÚÜ×Üçelect_own on public.command_runbooks
  for select to auth¹Ñ¥ÑÕÍ¥¹ ¡Í±ÐÕÑ ¹Õ¥ ¤¤¥Ì¹½Ð¹Õ±°¹¡Í²vV7BWFçVB×W6W%öB°¦7&VFRöÆ76öÖÖæE÷'Væ&öö·5ùÝ\]WÛÝÛÛXXËÛÛ[X[Ü[ÛÚÜÂÜ\]HÈ]]'henticated
  using ((select auth.uid()) is not null and (Í±ÐÕÑ ¹Õ¥ ¤¤õÕÍÉ}¥¤(Ý¥Ñ ¡¬ ¡Í±ÐÕÑ ¹Õ¦vB2æ÷BçVÆÂæB6VÆV7BWFçVB×W6W%öB°¦G&÷	ÛÛXÞHY^\ÝÈÛÛ[X[Ü[ÛÚ×ÜÝ\×ÜÙ[XÝÛÝÛÛXgc.command_runbook_steps;
create policy command_runbook_stÁÍ}Í±Ñ}½Ý¸½¸ÁÕ±¥¹½µµ¹}ÉÕ¹½½­}ÍÑÁÌ(½ÈÍ±v7BFòWFVçF6FVBW6ær6VÆV7BWFçVB2æ÷BçVÉÛ[
Ù[XÝ]]ZY

JO]\Ù\ÚY
NÂÜÛXÞHY^\Ýç command_action_runs_select_own on public.command_action_ÉÕ¹Ìì)ÉÑÁ½±¥ä½µµ¹}Ñ¥½¹}ÉÕ¹Í}Í±Ñ}½Ý¸½¸ÁÕvÆ2æ6öÖÖæEö7Föå÷'Vç0¢f÷"6VÆV7BFòWFVçF6FVBW6ÛÈ

Ù[XÝ]]ZY

JH\ÈÝ[[
Ù[XÝ]]ZY
'))=user_id);
drop policy if exists command_action_events_Í±Ñ}½Ý¸½¸ÁÕ±¥¹½µµ¹}Ñ¥½¹}Ù¹ÑÌì)É½ÀÁ½±¥ä¦vbW7G26öÖÖæEö7FöåöWfVçG5öç6W'Eö÷vâöâV&Æ2æ6öÖÖÛØXÝ[ÛÙ][ÎÂÜX]HÛXÞHÛÛ[X[ØXÝ[ÛÙ][×ÜÙ['ect_own on public.command_action_events
  for select to aÕÑ¡¹Ñ¥ÑÕÍ¥¹ ¡Í±ÐÕÑ ¹Õ¥ ¤¤¥Ì¹½Ð¹Õ±°¹¢w6VÆV7BWFçVB×W6W%öB°¦7&VFRöÆ76öÖÖæEö7Föé×Ù][×Ú[Ù\ÛÝÛÛXXËÛÛ[X[ØXÝ[ÛÙ][ÂÜ'insert to authenticated with check (
    (select auth.uid ¤¤¥Ì¹½Ð¹Õ±°(¹¡Í±ÐÕÑ ¹Õ¥ ¤¤õÕÍÉ}¥(væB7F÷#ÒtõtäU"p¢æBW7G2¢6VÆV7Bg&öÒV)ÛXËÛÛ[X[Ü[ÛÚÜÈÚ\HY\[ÛÚ×ÚY[§user_id=(select auth.uid())
    )
  );

create or replaceÕ¹Ñ¥½¸ÁÕ±¥¹½µµ¹}ÉÕ¹½½­}ÕÁÑ}ÕÉ ¤)ÉÑÕÉ¹ÌÒw&vvW"ÆæwVvRÇw7Â6V7W&Gçfö¶W"6WB6V&6÷FÙÜXXË×Ý[\\È		YÚ[Y]Ë\Ù\ÚY\È\Ý[Ý§rom old.user_id
     or new.intervention_id is distinct fÉ½´½±¹¥¹ÑÉÙ¹Ñ¥½¹}¥(½È¹Ü¹ÉÕ¹½½­}­ä¥Ì¥ÍÑ¥ºv7Bg&öÒöÆBç'Væ&ööµö¶W¢÷"æWrçFFÆR2F7Fæ7Bg&ùÛHÛ]BÜ]ËØXÝ]H\È\Ý[ÝÛHÛØ§jective
     or new.capability_ceiling is distinct from o±¹Á¥±¥Ñå}¥±¥¹(½È¹Ü¹ÁÁÉ½Ù±}ÉÅÕ¥É¥Ì¦w7Fæ7Bg&öÒöÆBæ&÷fÅ÷&WV&V@¢÷"æWrç6÷W&6UöfæyÙ\[\È\Ý[ÝÛHÛÛÝ\ÙWÙ[Ù\[Ü§ew.version is distinct from old.version
     or new.preco¹¥Ñ¥½¹Ì¥Ì¥ÍÑ¥¹ÐÉ½´½±¹ÁÉ½¹¥Ñ¥½¹Ì(½È¹Ü¹ÊvöÆÆ&6µ÷Æâ2F7Fæ7Bg&öÒöÆBç&öÆÆ&6µ÷Æà¢÷"éÙ]Ë]Y[ÙWÜ\]Z\[Y[È\È\Ý[ÝÛHÛ]Y[ÙWÜgquirements
     or new.generated_by is distinct from old.¹ÉÑ}ä(½È¹Ü¹ÉÑ}Ð¥Ì¥ÍÑ¥¹ÐÉ½´½±ºv7&VFVEö@¢FVà¢b7W'&VçE÷W6W#ÒvWFVçF6FVBrFYÛZ\ÙH^Ù\[Û	Ø]][XØ]YÛY[ÈX^HÛHgpprove a runbook through its governance fields';
    end ¥ì(¹¥ì(¥ÕÉÉ¹Ñ}ÕÍÈôÕÑ¡¹Ñ¥ÑÑ¡¸(vböÆBç7FGW3Ãâu$TEr÷"æWrç7FGW3Ãât$õdTBrFVà¢	ÈZ\ÙH^Ù\[Û	ÛÝÛ\[Ú][Û]\ÝHPQHOT'ROVED';
    end if;
    if new.approved_at is null then r¥ÍáÁÑ¥½¸ÁÁÉ½Ù}ÐÉÅÕ¥Éì¹¥ì(¹¥ì*ræWrçWFFVEöCÖæ÷r°¢&WGW&âæWs°¦VæC°¢BC°§&Wfö¶RÆÉÈÛ[Ý[ÛXXËÛÛ[X[Ü[ÛÚ×Ý\]WÙÝX\

HÛH'ublic,anon,authenticated;
drop trigger if exists command_ÉÕ¹½½­}ÕÁÑ}ÕÉ}ÑÉ¥È½¸ÁÕ±¥¹½µµ¹}ÉÕ¹½½­Ìì*v7&VFRG&vvW"6öÖÖæE÷'Væ&ööµ÷WFFUöwV&E÷G&vvW ¦&Vf÷)ÙH\]HÛXXËÛÛ[X[Ü[ÛÚÜÂÜXXÚÝÈ^XÝ]H'function public.command_runbook_update_guard();

create oÈÉÁ±Õ¹Ñ¥½¸ÁÕ±¥¹½µµ¹}ÉÕ¹½½­}ÍÑÁ}ÕÉ ¤)ÉwGW&ç2G&vvW"ÆæwVvRÇw7Â6V7W&Gçfö¶W"6WB6V&9ÚÜ]\XXË×Ý[\\È		YÚ[Y]ËØ\X[]WØÛgss='OBSERVE' and new.action_kind not in ('SNAPSHOT_EVIDEN°!-}AI=9%Q%=9L¤Ñ¡¸(É¥ÍáÁÑ¥½¸¥¹ÙvÆBô%4U%dR7Föâ¶æBs°¢VÇ6bæWræ6&ÆGö6Æ73Òu	ÔÔÔÑIÈ[]ËXÝ[ÛÚÚ[Ý[
	ÑÑSTUWÔÔÔÐS	ÊH'then
    raise exception 'invalid PROPOSE action kind';
 ±Í¥¹Ü¹Á¥±¥Ñå}±ÍÌôIYIM%	1}aUQ¹¹Üºv7Föåö¶æBæ÷Bâu$U$UôåDU$äÅõtõ$µõ4´tRrÂtåDYÔSÔPÓÔÕTUIÊH[Z\ÙH^Ù\[Û	Ú[[YgVERSIBLE_EXECUTE action kind';
  elsif new.capability_claÍÌô!U59}AAI=Y1}IEU%I¹¹Ü¹Ñ¥½¹}­¥¹¹½Ð¥¸¢rtõtäU%ô$õdÂrFVà¢&6RW6WFöâvçfÆBTÔé×ÐTÕSÔTURTQXÝ[ÛÚ[	ÎÂ[ÚY]ËØ\X[]WØçlass='FORBIDDEN' and new.action_kind not in ('TRADE_ORDER°Ae59P°U9}QI9MH°I9Q%1}!9°MIQ}t44U52rÂtUDU$äÅô%$UdU%4$ÄRrFVà¢&6RW6WFöâ	ÉÚ[[YÔQSXÝ[ÛÚ[	ÎÂ[YÂY]ËØ\X§ility_class in ('HUMAN_APPROVAL_REQUIRED','FORBIDDEN') an¹Ü¹ÕÑ½}áÕÑ±Ñ¡¸(É¥ÍáÁÑ¥½¸¡Õµ¸µÒvVB÷"f÷&&FFVâ7FW26ææ÷BWFòÖWV7WFRs°¢VæBc°¢Ù]ËØ\X[]WØÛ\ÜÏIÑÔQSÈ[]ËÝ]\ÏÐÐÒçED' then
    raise exception 'forbidden steps must remain	1=-ì(¹¥ì(¥¹Ü¹ÉÅÕ¥ÉÍ}½Ý¹É}ÁÁÉ½Ù°¹ræWræ6&ÆGö6Æ72æ÷Bâu$UdU%4$ÄUôUT5UDRrÂtTÔé×ÐTÕSÔTURTQ	ÊH[Z\ÙH^Ù\[Û	ÛÝÛ\\§oval flag is invalid for this capability class';
  end ifì(¹Ü¹ÕÁÑ}Ðõ¹½Ü ¤ì(ÉÑÕÉ¸¹Üì)¹ì(ì)ÉÙ½­vÆÂöâgVæ7FöâV&Æ2æ6öÖÖæE÷'Væ&ööµ÷7FWöwV&Bg&öÒ	ÝXXË[Û]][XØ]YÂÜYÙÙ\Y^\ÝÈÛÛ[X[çrunbook_step_guard_trigger on public.command_runbook_stepÌì)ÉÑÑÉ¥È½µµ¹}ÉÕ¹½½­}ÍÑÁ}ÕÉ}ÑÉ¥È)¾w&Rç6W'B÷"WFFRöâV&Æ2æ6öÖÖæE÷'Væ&ööµ÷7FW0¦f÷"YØXÚÝÈ^XÝ]H[Ý[ÛXXËÛÛ[X[Ü[ÛÚ×ÜÝ\ÙÝX\§d();

create or replace function public.command_action_ru¹}ÕÉ ¤)ÉÑÕÉ¹ÌÑÉ¥È±¹ÕÁ±ÁÍÅ°ÍÕÉ¥Ñä¥¹Ù½®vW"6WB6V&6÷F×V&Æ2Çu÷FV× ¦2B@¦&Vvà¢bæWræ6ÜX[]WØÛ\ÜÈ[
	ÒSPSÐTÕSÔTURTQ	Ë	ÑÔQSÊg and new.status<>'BLOCKED' then
    raise exception 'huma¸µÑ½È½É¥¸Á¥±¥Ñ¥Ì¹¹½ÐÉ½ÉáÕÑ¥½ºr7V66W72s°¢VæBc°¢bæWræ7Föåö¶æBâuE$DUôõ$DYÔË	ÔVSQS	Ë	ÑSÕSÑTË	ÐÔQSPSÐÒSÑIË	ÔÑPÔUçACCESS','EXTERNAL_IRREVERSIBLE')
     and new.status<>'BL=-Ñ¡¸(É¥ÍáÁÑ¥½¸½É¥¸áÑÉ¹°Ñ¥¾vâ6ææ÷BWV7WFRs°¢VæBc°¢b6öÆW66RæWræv÷fW&ææ9ÙKOÙ[×Û[ÝY	ÊNÛÛX[[ÙJBÜÛØ[\ØÙJ
]Ë§governance->>'trades_sent')::boolean,false)
     or coaleÍ ¡¹Ü¹½ÙÉ¹¹´øøÉ¹Ñ¥±Í}¡¹¤èé½½±¸±²w6R¢÷"6öÆW66RæWræv÷fW&ææ6RÓãâvWFW&æÅö'&WfW'9ÚXWØXÝ[ÛÊNÛÛX[[ÙJB[Z\ÙH^Ù\[Û''V175 action run violates hard governance boundary';
  en¥ì(ÉÑÕÉ¸¹Üì)¹ì(ì)ÉÙ½­±°½¸Õ¹Ñ¥½¸ÁÕ±¦v2æ6öÖÖæEö7Föå÷'VåöwV&Bg&öÒV&Æ2ÆæöâÆWFVçF6IÙYÂÜYÙÙ\Y^\ÝÈÛÛ[X[ØXÝ[ÛÜ[ÙÝX\ÝYÙçer on public.command_action_runs;
create trigger command_Ñ¥½¹}ÉÕ¹}ÕÉ}ÑÉ¥È)½É¥¹ÍÉÐ½¸ÁÕ±¥¹½µµ¹~v7Föå÷'Vç0¦f÷"V6&÷rWV7WFRgVæ7FöâV&Æ2æ6öÖÖæEùØXÝ[ÛÜ[ÙÝX\

NÂÜX]HÜ\XÙH[Ý[ÛXXËÛçmmand_approve_runbook(
  p_runbook_id uuid,p_note text deÕ±Ð(¤)ÉÑÕÉ¹Ì©Í½¹)±¹ÕÁ±ÁÍÅ°)ÍÕÉ¥Ñä¥¹Ù½­w §6WB6V&6÷F×V&Æ2Çu÷FV× ¦2B@¦FV6Æ&P¢e÷VBWYÚYH
Ù[XÝ]]ZY

JNÂÛÛXXËÛÛ[X[Ü[ÛÚçs%rowtype;
  v_new public.command_runbooks%rowtype;
begin(¥Ù}Õ¥¥Ì¹Õ±°Ñ¡¸É¥ÍáÁÑ¥½¸ÕÑ¡¹Ñ¥Ñ¥½¸w&WV&VBs²VæBc°¢6VÆV7B¢çFòeööÆBg&öÒV&Æ2æ6öÖÙØ[Ü[ÛÚÜÂÚ\HY\Ü[ÛÚ×ÚY[\Ù\ÚY]ÝZY'for update;
  if not found then raise exception 'runbook ¹½Ð½Õ¹ì¹¥ì(¥Ù}½±¹ÍÑÑÕÌðøIdÑ¡¸É¥ÍrW6WFöâw'Væ&öö²2æ÷B&VGf÷"&÷fÂs²VæBc°¢	ÈYÝÛÛ\Ý[Ü\]Z\Y[Z\ÙH^Ù\[Û	Ü[§book does not require owner approval'; end if;
  update pÕ±¥¹½µµ¹}ÉÕ¹½½­Ì(ÍÐÍÑÑÕÌôAAI=Y±ÁÁÉ½Ù}wCÖæ÷rÆ&÷fÅöæ÷FSÖ6öÆW66Röæ÷FRÂrr¢vW&RC×÷'YÛÛÚ×ÚY[\Ù\ÚY]ÝZY]\[È
[ÈÛ]ÎÂ[§sert into public.command_action_events(
    user_id,runbo½­}¥±Ù¹Ñ}ÑåÁ±Ñ½È±¹½Ñ±Ù¥¹(¤Ù±ÕÌ (Ù}ÖvBÇ÷'Væ&ööµöBÂu%Tä$ôôµô$õdTBrÂtõtäU"rÆ6öÆW66Röæ÷IÙK	ÉÊKÛÛØZ[ÛØXÝ
	ØØ\X[]WØÙZ[[ÉËÛ]Ë§capability_ceiling,'version',v_new.version)
  );
  returnÑ½}©Í½¹¡Ù}¹Ü¤ì)¹ì(ì)ÉÙ½­±°½¸Õ¹Ñ¥½¸ÁÕ±¥ºv6öÖÖæEö&÷fU÷'Væ&öö²WVBÇFWBg&öÒV&Æ2Ææöã°¦w&éÝ^XÝ]HÛ[Ý[ÛXXËÛÛ[X[Ø\ÝWÜ[ÛÚÊ]ZY',text) to authenticated;
