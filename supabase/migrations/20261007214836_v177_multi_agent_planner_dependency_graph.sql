
create table if not exists public.command_plans (
  id uÕ¥ÁÉ¥µÉä­äÕ±Ð¹}É¹½µ}ÕÕ¥ ¤°(ÕÍÉ}¥ÕÕ¥ræ÷BçVÆÂ&VfW&Væ6W2WFçW6W'2BöâFVÆWFR666FRÀ¢	Ü[ÚÙ^H^Ý[ÛÝ\ÙWÝ\H^Ý[Ûçurce_client_id text not null,
  objective_client_id text,(Ñ¥Ñ±ÑáÐ¹½Ð¹Õ±°°(½©Ñ¥ÙÑáÐ¹½Ð¹Õ±°Õ±ÒrrrÀ¢FöÖâFWBæ÷BçVÆÂFVfVÇBtõU$Dôå2rÀ¢7FGYÜÈ^Ý[Y][	ÐPÕUIÂÚXÚÈ
Ý]\È[
	ÐgCTIVE','WAITING_HUMAN','READY','STALE','ARCHIVED')),
  pr¥½É¥ÑäÍµ±±¥¹Ð¹½Ð¹Õ±°Õ±ÐÔÀ¡¬¡ÁÉ¥½É¥ÑäÑÝvVâæBÀ¢fW'6öâçFVvW"æ÷BçVÆÂFVfVÇB6V6¹È
\Ú[ÛLJKÛÝ\ÙWÙ[Ù\[^Ý[Ý[[gary text not null default '',
  bottleneck text not null Õ±Ð°(Ù¥¹©Í½¹¹½Ð¹Õ±°Õ±Ðíôèé©Í½¹rÀ¢7&VFVEöBFÖW7F×G¢æ÷BçVÆÂFVfVÇBæ÷rÀ¢WFÝYØ][Y\Ý[\Ý[Y][ÝÊ
K[\]YJ\Ù\çid,plan_key)
);
alter table public.command_plans drop conÍÑÉ¥¹Ð¥á¥ÍÑÌ½µµ¹}Á±¹Í}Í½ÕÉ}ÑåÁ}¡¬ì)±ÑÈwF&ÆRV&Æ2æ6öÖÖæE÷Æç2FB6öç7G&çB6öÖÖæE÷Æç5÷9ÛÝ\ÙWÝ\WØÚXÚÂÚXÚÈ
ÛÝ\ÙWÝ\H[
	ÔÒPÕ	Ë	ÒSgRVENTION'));

create table if not exists public.command_p±¹}ÑÍ­Ì (¥ÕÕ¥ÁÉ¥µÉä­äÕ±Ð¹}É¹½µ}ÕÕ¥rÀ¢W6W%öBWVBæ÷BçVÆÂ&VfW&Væ6W2WFçW6W'2Böâ	Ù[]HØ\ØØYK[ÚY]ZYÝ[Y\[Ù\ÈXXç.command_plans(id) on delete cascade,
  task_key text not¹Õ±°°(Á½Í¥Ñ¥½¸Íµ±±¥¹Ð¹½Ð¹Õ±°¡¬¡Á½Í¥Ñ¥½¸ÑÝvVâæBÀ¢FFÆRFWBæ÷BçVÆÂÀ¢FW67&FöâFWBéÛÝ[Y][	ÉËÛXZ[^Ý[Ø\X[]Wçclass text not null
    check (capability_class in ('OBSEIY°AI=A=M°IYIM%	1}aUQ°!U59}%M%=8¤¤°(r7Föåö¶æBFWBæ÷BçVÆÀ¢6V6²7Föåö¶æBâuÉÐSTÑUQSÑIË	ÔSTÔÖSTÒTÉË	ÔSTÕÓÔ×ÔPÒÐQÑg','PLANNER_QA','HUMAN_DECISION')),
  assigned_agent_id uu¥ÉÉ¹ÌÁÕ±¥¹½µµ¹}¹ÑÌ¡¥¤½¸±ÑÍÐ¹Õ²vÂÀ¢7FGW2FWBæ÷BçVÆÂFVfVÇBuÄääTBp¢6V6²7IØ]\È[
	ÔSQ	Ë	ÔPQIË	ÔSSÉË	ÐÓÓTUIË	ÐÐÒÑQ	ç,'ESCALATED','STALE')),
  priority smallint not null defaÕ±ÐÔÀ¡¬¡ÁÉ¥½É¥ÑäÑÝ¸À¹ÄÀÀ¤°(Ý½É­}½ÉÈªw6öæ"æ÷BçVÆÂFVfVÇBw·Òs£¦§6öæ"À¢÷WGWB§6öæ"æ÷BçVÉÛY][	ÞßIÎÛÛ]Y[ÙHÛÛÝ[Y][''{}'::jsonb,
  source_fingerprint text not null,
  starte}ÐÑ¥µÍÑµÁÑè°(½µÁ±Ñ}ÐÑ¥µÍÑµÁÑè°(ÉÑ}wBFÖW7F×G¢æ÷BçVÆÂFVfVÇBæ÷rÀ¢WFFVEöBFÖW7IØ[\Ý[Y][ÝÊ
K[\]YJ[ÚY\Ú×ÚÙ^JB§);

create table if not exists public.command_plan_depend¹¥Ì (¥ÕÕ¥ÁÉ¥µÉä­äÕ±Ð¹}É¹½µ}ÕÕ¥ ¤²p¢W6W%öBWVBæ÷BçVÆÂ&VfW&Væ6W2WFçW6W'2BöâFVÉÙ]HØ\ØØYK[ÚY]ZYÝ[Y\[Ù\ÈXXËÛçmmand_plans(id) on delete cascade,
  predecessor_task_id ÕÕ¥¹½Ð¹Õ±°ÉÉ¹ÌÁÕ±¥¹½µµ¹}Á±¹}ÑÍ­Ì¡¥¤½ºrFVÆWFR666FRÀ¢7V66W76÷%÷F6µöBWVBæ÷BçVÆÂ&VfW&YÛÙ\ÈXXËÛÛ[X[Ü[Ý\ÚÜÊY
HÛ[]HØ\ØØYK'ependency_type text not null default 'FINISH_TO_START'
  ¡¬¡Á¹¹å}ÑåÁ¥¸ %9%M!}Q=}MQIP°Y%9rÂtTÔåôtDRrÀ¢7&VFVEöBFÖW7F×G¢æ÷BçVÆÂFVfVÉÝÝÊ
K[\]YJ[ÚYYXÙ\ÜÛÜÝ\Ú×ÚYÝXØÙ\ÜÛÜÝ'ask_id),
  check (predecessor_task_id<>successor_task_id)(¤ì()ÉÑÑ±¥¹½Ðá¥ÍÑÌÁÕ±¥¹½µµ¹}Á±¹¹É}Îv6ÆFöç2¢BWVB&Ö'¶WFVfVÇBvVå÷&æFöÕ÷WVIÊ
K\Ù\ÚY]ZYÝ[Y\[Ù\È]]\Ù\ÊY
HÛ'delete cascade,
  plan_id uuid not null references public¹½µµ¹}Á±¹Ì¡¥¤½¸±ÑÍ°(ÑÍ­}¥ÕÕ¥¹½ÐvçVÆÂ&VfW&Væ6W2V&Æ2æ6öÖÖæE÷Æå÷F6·2BöâFVÆWFR9Ø\ØØYK\ØØ[][ÛÚÙ^H^Ý[X\ÛÛ^Ý' null,
  question text not null,
  priority smallint not ¹Õ±°Õ±ÐÜÔ¡¬¡ÁÉ¥½É¥ÑäÑÝ¸À¹ÄÀÀ¤°(ÍÑwGW2FWBæ÷BçVÆÂFVfVÇBtõTâp¢6V6²7FGW2âtùÔSË	ÐPÒÓÕÓQÑQ	Ë	ÔTÓÓQ	ÊJKÝÛ\Ü\ÜÛÙH^§ot null default '',
  evidence jsonb not null default '{}èé©Í½¹°(½Á¹}ÐÑ¥µÍÑµÁÑè¹½Ð¹Õ±°Õ±Ð¹½Ü ¤²p¢6¶æ÷vÆVFvVEöBFÖW7F×G¢À¢&W6öÇfVEöBFÖW7F×G©Ë\]YØ][Y\Ý[\Ý[Y][ÝÊ
KÚYÛ§al_active boolean not null default true,
  cleared_at timÍÑµÁÑè°(Õ¹¥ÅÕ¡ÕÍÉ}¥±Í±Ñ¥½¹}­ä¤(¤ì)±ÑÈÑ±rV&Æ2æ6öÖÖæE÷ÆææW%öW66ÆFöç2FB6öÇVÖâbæ÷BWÜÝÈÚYÛ[ØXÝ]HÛÛX[Ý[Y][YNÂ[\gble public.command_planner_escalations add column if not á¥ÍÑÌ±É}ÐÑ¥µÍÑµÁÑèì()ÉÑÑ±¥¹½Ðá¥ÍÒw2V&Æ2æ6öÖÖæE÷ÆææW%öWfVçG2¢BWVB&Ö'¶WIÙY][Ù[Ü[ÛWÝ]ZY

K\Ù\ÚY]ZYÝ[Y\[§ces auth.users(id) on delete cascade,
  plan_id uuid not ¹Õ±°ÉÉ¹ÌÁÕ±¥¹½µµ¹}Á±¹Ì¡¥¤½¸±ÑÍvRÀ¢F6µöBWVB&VfW&Væ6W2V&Æ2æ6öÖÖæE÷Æå÷F6·2IÊHÛ[]HÙ][][ÚÙ^H^Ý[][çtype text not null,
  actor text not null default 'SYSTEM¡¬¡Ñ½È¥¸ MeMQ4°=]9H¤¤°(¹½ÑÑáÐ¹½Ð¹ÖvÆÂFVfVÇBrrÀ¢WfFVæ6R§6öæ"æ÷BçVÆÂFVfVÇBw·Òs£¦§9ÛÛÜX]YØ][Y\Ý[\Ý[Y][ÝÊ
Kgnique(user_id,event_key)
);

create index if not exists c½µµ¹}Á±¹Í}ÕÍÉ}ÍÑÑÕÍ}¥à½¸ÁÕ±¥¹½µµ¹}Á±¹Ì¡ÕÍÊuöBÇ7FGW2Ç&÷&GFW62ÇWFFVEöBFW62°¦7&VFRæFWÙÝ^\ÝÈÛÛ[X[Ü[Ý\ÚÜ×Ü[ÚYÛXXËÛÛ[X[§d_plan_tasks(user_id,plan_id,position);
create index if n½Ðá¥ÍÑÌ½µµ¹}Á±¹}ÑÍ­Í}¹Ñ}¥à½¸ÁÕ±¥¹½µµ¹~wÆå÷F6·2W6W%öBÆ76væVEövVçEöBÇ7FGW2°¦7&VFRæFYÞYÝ^\ÝÈÛÛ[X[Ü[Ù\[[ÚY\×Ü[ÚYÛX§lic.command_plan_dependencies(user_id,plan_id);
create inà¥¹½Ðá¥ÍÑÌ½µµ¹}Á±¹¹É}Í±Ñ¥½¹Í}ÕÍÉ}ÍÑÑÕÎuöGöâV&Æ2æ6öÖÖæE÷ÆææW%öW66ÆFöç2W6W%öBÇ7FGW9Ë[Ü]H\ØË\]YØ]\ØÊNÂÜX]H[^YÝ^\çts command_planner_events_user_idx on public.command_plan¹É}Ù¹ÑÌ¡ÕÍÉ}¥±ÉÑ}ÐÍ¤ì()±ÑÈÑ±ÁÕ±¥ºv6öÖÖæE÷Æç2Væ&ÆR&÷rÆWfVÂ6V7W&G°¦ÇFW"F&ÆRV&ÉÚXËÛÛ[X[Ü[Ý\ÚÜÈ[XHÝÈ][ÙXÝ\]NÂ[\gble public.command_plan_dependencies enable row level secÕÉ¥Ñäì)±ÑÈÑ±ÁÕ±¥¹½µµ¹}Á±¹¹É}Í±Ñ¥½¹Ì¹v&ÆR&÷rÆWfVÂ6V7W&G°¦ÇFW"F&ÆRV&Æ2æ6öÖÖæE÷ÆææYÜÙ][È[XHÝÈ][ÙXÝ\]NÂ]ÚÙH[ÛXXç.command_plans from anon,authenticated,service_role;
revo­±°½¸ÁÕ±¥¹½µµ¹}Á±¹}ÑÍ­ÌÉ½´¹½¸±ÕÑ¡¹Ñ¥ÒvVBÇ6W'f6U÷&öÆS°§&Wfö¶RÆÂöâV&Æ2æ6öÖÖæE÷ÆåöFWVæIÙ[ÚY\ÈÛH[Û]][XØ]YÙ\XÙWÜÛNÂ]ÚÙH[çn public.command_planner_escalations from anon,authenticaÑ±ÍÉÙ¥}É½±ì)ÉÙ½­±°½¸ÁÕ±¥¹½µµ¹}Á±¹¹É}ÚvVçG2g&öÒæöâÆWFVçF6FVBÇ6W'f6U÷&öÆS° ¦w&çB6VÆV7B	ÛÛXXËÛÛ[X[Ü[ÈÈ]][XØ]YÂÜ[Ù[XÝÛ§ public.command_plan_tasks to authenticated;
grant select½¸ÁÕ±¥¹½µµ¹}Á±¹}Á¹¹¥ÌÑ¼ÕÑ¡¹Ñ¥Ñì)ÊvçB6VÆV7BÇWFFRöâV&Æ2æ6öÖÖæE÷ÆææW%öW66ÆFöç2IÛÈ]][XØ]YÂÜ[Ù[XÝÛXXËÛÛ[X[Ü[\Ùgvents to authenticated;

grant select,insert,update on pu±¥¹½µµ¹}Á±¹ÌÑ¼ÍÉÙ¥}É½±ì)É¹ÐÍ±Ð±¥¹ÍÉÐ±ÖwFFRöâV&Æ2æ6öÖÖæE÷Æå÷F6·2Fò6W'f6U÷&öÆS°¦w&çIÈÙ[XÝ[Ù\ÛXXËÛÛ[X[Ü[Ù\[[ÚY\ÈÈÙ\§vice_role;
grant select,insert,update on public.command_p±¹¹É}Í±Ñ¥½¹ÌÑ¼ÍÉÙ¥}É½±ì)É¹ÐÍ±Ð±¥¹ÍÉÐ¾vâV&Æ2æ6öÖÖæE÷ÆææW%öWfVçG2Fò6W'f6U÷&öÆS° ¦G&÷ùÛXÞHY^\ÝÈÛÛ[X[Ü[×ÜÙ[XÝÛÝÛÛXXËÛÛ[X['_plans;
create policy command_plans_select_own on public.½µµ¹}Á±¹Ì½ÈÍ±ÐÑ¼ÕÑ¡¹Ñ¥Ñ)ÕÍ¥¹ ¡Í±ÐvWFçVB2æ÷BçVÆÂæB6VÆV7BWFçVB×W6W%öB¹ÂÜÛXÞHY^\ÝÈÛÛ[X[Ü[Ý\ÚÜ×ÜÙ[XÝÛÝÛÛ'public.command_plan_tasks;
create policy command_plan_tas­Í}Í±Ñ}½Ý¸½¸ÁÕ±¥¹½µµ¹}Á±¹}ÑÍ­Ì½ÈÍ±ÐÑ¼vWFVçF6FV@§W6ær6VÆV7BWFçVB2æ÷BçVÆÂæB	ÊÙ[XÝ]]ZY

JO]\Ù\ÚY
NÂÜÛXÞHY^\ÝÈÛÛ[gand_plan_dependencies_select_own on public.command_plan_dÁ¹¹¥Ìì)ÉÑÁ½±¥ä½µµ¹}Á±¹}Á¹¹¥Í}Í±v7Eö÷vâöâV&Æ2æ6öÖÖæE÷ÆåöFWVæFVæ6W2f÷"6VÆV7BFò	Ø]][XØ]Y\Ú[È

Ù[XÝ]]ZY

JH\ÈÝ[['(select auth.uid())=user_id);

drop policy if exists comm¹}Á±¹¹É}Í±Ñ¥½¹Í}Í±Ñ}½Ý¸½¸ÁÕ±¥¹½µµ¹}Á±ºvæW%öW66ÆFöç3°¦G&÷öÆ7bW7G26öÖÖæE÷ÆææW%öW9ØØ[][Û×Ý\]WÛÝÛÛXXËÛÛ[X[Ü[\Ù\ØØ[][Û§s;
create policy command_planner_escalations_select_own o¸ÁÕ±¥¹½µµ¹}Á±¹¹É}Í±Ñ¥½¹Ì½ÈÍ±ÐÑ¼ÕÑ¡ºwF6FV@§W6ær6VÆV7BWFçVB2æ÷BçVÆÂæB6VÆV9Ý]]ZY

JO]\Ù\ÚY
NÂÜX]HÛXÞHÛÛ[X[Ü[\Ù\Øçalations_update_own on public.command_planner_escalations½ÈÕÁÑÑ¼ÕÑ¡¹Ñ¥Ñ)ÕÍ¥¹ ¡Í±ÐÕÑ ¹Õ¥ ¤¤¦w2æ÷BçVÆÂæB6VÆV7BWFçVB×W6W%öB§vF6V6²ÜÙ[XÝ]]ZY

JH\ÈÝ[[
Ù[XÝ]]ZY

JO]\çer_id);

drop policy if exists command_planner_events_selÑ}½Ý¸½¸ÁÕ±¥¹½µµ¹}Á±¹¹É}Ù¹ÑÌì)ÉÑÁ½±¥ävöÖÖæE÷ÆææW%öWfVçG5÷6VÆV7Eö÷vâöâV&Æ2æ6öÖÖæE÷ÆææYÜÙ][ÈÜÙ[XÝÈ]][XØ]Y\Ú[È

Ù[XÝ]]§uid()) is not null and (select auth.uid())=user_id);

updÑÁÕ±¥¹½µµ¹}¹ÑÌ)ÍÐ±±½Ý}Ñ¥½¹}­¥¹ÌõÍvvVçEö¶W¢vVâtDDôtTåBrFVâu²%4ä4õEôUdDTä4R"Â)ÐÒPÒ×ÔPÓÓUSÓÈSTÑUQSÑHIÎÛÛÚ[	çRESEARCH_AGENT' then '["GENERATE_PROPOSAL","PLANNER_SYNTHM%Ltèé©Í½¹(Ý¡¸E}9PÑ¡¸lM9AM!=Q}Y%9tR"Â$4T4µõ$T4ôäDDôå2"Â$tTäU$DUõ$õõ4Â"Â%ÄääU%õ)×IÎÛÛÚ[	ÑSÒSQTS×ÐQÑS	È[	ÖÈÑSTUWÔçPOSAL","PREPARE_INTERNAL_WORK_PACKAGE","INTERNAL_RECORD_UAQ°A199I}Me9Q!M%L°A199I}]=I-}A-tèé©Í½ºv ¢vVâu$ôET5EôtTåBrFVâu²$tTäU$DUõ$õõ4Â"Â%$U	ÐTWÒSTSÕÓÔ×ÔPÒÐQÑHSTSÔPÓÔÕTUHS§NER_SYNTHESIS","PLANNER_WORK_PACKAGE"]'::jsonb
  when 'SE=}9PÑ¡¸l9IQ}AI=A=M0°AIAI}%9QI91}]=Jtµõ4´tR"Â$åDU$äÅõ$T4õ$EõUDDR"Â%ÄääU%õ5åDU42"Â)ÔSTÕÓÔ×ÔPÒÐQÑHIÎÛÛÚ[	ÓÔTUSÓ×ÐQÑS	È'then '["GENERATE_PROPOSAL","PREPARE_INTERNAL_WORK_PACKAGE°%9QI91}I=I}UAQ°A199I}Me9Q!M%L°A199I}^tõ$µõ4´tR%Òs£¦§6öæ ¢VÇ6RÆÆ÷vVEö7Föåö¶æG2Væ@§vYÜHYÙ[ÚÙ^H[
	ÑUWÐQÑS	Ë	ÔTÑPTÒÐQÑS	Ë	ÔPWÐQÑS	ç,'ENGINEERING_AGENT','PRODUCT_AGENT','SEO_AGENT','OPERATI=9M}9P¤ì()ÉÑ½ÈÉÁ±Õ¹Ñ¥½¸ÁÕ±¥¹½µµ¹}ÂvÆå÷F6µöwV&B§&WGW&ç2G&vvW"ÆæwVvRÇw7Â6V7W&IÞH[ÚÙ\Ù]ÙX\ÚÜ]\XXË×Ý[\\È		XÛ\Hçagent public.command_agents%rowtype; v_rank integer; v_ce¥±¥¹¥¹ÑÈì)¥¸(¥¹Ü¹Á¥±¥Ñå}±ÍÌô!U59}t4ôârFVà¢bæWræ76væVEövVçEöB2æ÷BçVÆÂFVéÈZ\ÙH^Ù\[Û	Ú[X[XÚ\Ú[Û\ÚÈØ[ÝH\ÜÚYÛY'to an agent'; end if;
    if new.action_kind<>'HUMAN_DECIM%=8Ñ¡¸É¥ÍáÁÑ¥½¸¡Õµ¸¥Í¥½¸ÑÍ¬¡Ì¥¹Ù²vB7Föâ¶æBs²VæBc°¢VÇ6P¢bæWræ76væVEövVçI×ÚY\È[[Z\ÙH^Ù\[Û	ÜØYH[\\ÚÈ\]Zgres an assigned agent'; end if;
    select * into v_agentÉ½´ÁÕ±¥¹½µµ¹}¹ÑÌÝ¡É¥õ¹Ü¹ÍÍ¥¹}¹Ñ}¦vBæBW6W%öCÖæWrçW6W%öC°¢bæ÷Bf÷VæBFVâ&6RWØÙ\[Û	Ü[\\ÚÈYÙ[ÝÛ\Ú\Z\ÛX]Ú	ÎÈ[YÂ§    if v_agent.status<>'ACTIVE' then raise exception 'pla¹¹ÈÑÍ¬¹Ð¥Ì¹½ÐÑ¥Ùì¹¥ì(¥¹½Ð¡Ù}vçBæÆÆ÷vVEö7Föåö¶æG2òæWræ7Föåö¶æBFVâ&6RW9Ù\[Û	Ü[\XÝ[ÛÚ[\ÈÝ]ÚYH\ÜÚYÛYYÙ[Y'get'; end if;
    v_rank:=case new.capability_class when =	MIYÑ¡¸ÄÝ¡¸AI=A=MÑ¡¸ÈÝ¡¸IYIM%	1}uT5UDRrFVâ2VÇ6RVæC°¢eö6VÆæs£Ö66ReövVçBæ9Ø\X[]WØÙZ[[ÈÚ[	ÓÐÑTIÈ[HÚ[	ÔÔÔÑIÈ'en 2 when 'REVERSIBLE_EXECUTE' then 3 else 0 end;
    if Ù}É¹¬ùÙ}¥±¥¹Ñ¡¸É¥ÍáÁÑ¥½¸Á±¹¹ÈÑÍ¬ávG2vVçB6&ÆG6VÆærs²VæBc°¢VæBc°¢æWrçWIØ]YØ][ÝÊ
NÂ]\]ÎÂ[Â	Â]ÚÙH[Û[Ý'ion public.command_plan_task_guard() from public,anon,aut¡¹Ñ¥Ñì)É½ÀÑÉ¥È¥á¥ÍÑÌ½µµ¹}Á±¹}ÑÍ­}ÕÊvE÷G&vvW"öâV&Æ2æ6öÖÖæE÷Æå÷F6·3°¦7&VFRG&vvW"6ùÛ[X[Ü[Ý\Ú×ÙÝX\ÝYÙÙ\YÜH[Ù\Ü\]HÛ'public.command_plan_tasks
for each row execute function pÕ±¥¹½µµ¹}Á±¹}ÑÍ­}ÕÉ ¤ì()ÉÑ½ÈÉÁ±Õ¹ÒvöâV&Æ2æ6öÖÖæE÷ÆåöFWVæFVæ7öwV&B§&WGW&ç2G&vvYÜ[ÝXYÙHÜÜ[ÙXÝ\]H[ÚÙ\Ù]ÙX\ÚÜ]\Xgc,pg_temp
as $$
declare v_pred public.command_plan_tasks%É½ÝÑåÁìÙ}ÍÕÁÕ±¥¹½µµ¹}Á±¹}ÑÍ­ÌÉ½ÝÑåÁìÙ}å²vR&ööÆVã£ÖfÇ6S°¦&Vvà¢6VÆV7B¢çFòe÷&VBg&öÒV&ÆØËÛÛ[X[Ü[Ý\ÚÜÈÚ\HY[]ËYXÙ\ÜÛÜÝ\Ú×ÚY[' plan_id=new.plan_id and user_id=new.user_id;
  if not foÕ¹Ñ¡¸É¥ÍáÁÑ¥½¸Á¹¹äÁÉÍÍ½È½Ý¹ÉÍ¡¦wÖ6ÖF6s²VæBc°¢6VÆV7B¢çFòe÷7V62g&öÒV&Æ2æ9ÛÛ[X[Ü[Ý\ÚÜÈÚ\HY[]ËÝXØÙ\ÜÛÜÝ\Ú×ÚY[[§_id=new.plan_id and user_id=new.user_id;
  if not found t¡¸É¥ÍáÁÑ¥½¸Á¹¹äÍÕÍÍ½È½Ý¹ÉÍ¡¥Àµ¥ÍµwF6s²VæBc°¢vF&V7W'6fR&V6B2¢6VÆV7B	ÙÝXØÙ\ÜÛÜÝ\Ú×ÚYÛHXXËÛÛ[X[Ü[Ù\[[ÚY\ç d
    where d.plan_id=new.plan_id and d.user_id=new.user}¥¹¹ÁÉÍÍ½É}ÑÍ­}¥õ¹Ü¹ÍÕÍÍ½É}ÑÍ­}¥(Övæöà¢6VÆV7BBç7V66W76÷%÷F6µöBg&öÒV&Æ2æ6öÖÖæE÷	Û[Ù\[[ÚY\ÈÚ[XXÚÛYXÙ\ÜÛÜÝ\Úç_id=r.id
    where d.plan_id=new.plan_id and d.user_id=neÜ¹ÕÍÉ}¥(¤(Í±Ðá¥ÍÑÌ¡Í±ÐÄÉ½´É Ý¡É¦vCÖæWrç&VFV6W76÷%÷F6µöBçFòeö76ÆS°¢beö76ÆRFYÛZ\ÙH^Ù\[Û	Ù\[[ÞHÛÝ[ÜX]HHÞXÛIÎÈ['if;
  return new;
end;
$$;
revoke all on function public.½µµ¹}Á±¹}Á¹¹å}ÕÉ ¤É½´ÁÕ±¥±¹½¸±ÕÑ¡¹Ñ¦v6FVC°¦G&÷G&vvW"bW7G26öÖÖæE÷ÆåöFWVæFVæ7öwVÜÝYÙÙ\ÛXXËÛÛ[X[Ü[Ù\[[ÚY\ÎÂÜX]H§igger command_plan_dependency_guard_trigger before insert½¸ÁÕ±¥¹½µµ¹}Á±¹}Á¹¹¥Ì)½È É½ÜáÕÑrgVæ7FöâV&Æ2æ6öÖÖæE÷ÆåöFWVæFVæ7öwV&B° ¦7&VFYÈÜ\XÙH[Ý[ÛXXËÛÛ[X[Ü[\Ù\ØØ[][ÛÙÝgard()
returns trigger language plpgsql security invoker sÐÍÉ¡}ÁÑ õÁÕ±¥±Á}ÑµÀ)Ì)¥¸(¥ÕÉÉ¹Ñ}ÕÎvW#ÒvWFVçF6FVBrFVà¢bæWrçW6W%öB2F7Fæ7Bg)ÛÛHÛ\Ù\ÚYÜ]Ë[ÚY\È\Ý[ÝÛHÛ'.plan_id
       or new.task_id is distinct from old.task_¥(½È¹Ü¹Í±Ñ¥½¹}­ä¥Ì¥ÍÑ¥¹ÐÉ½´½±¹ÍvÆFöåö¶W¢÷"æWrç&V6öâ2F7Fæ7Bg&öÒöÆBç&V9ÛÛÜ]Ë]Y\Ý[Û\È\Ý[ÝÛHÛ]Y\Ý[Û'      or new.priority is distinct from old.priority
     ½È¹Ü¹Ù¥¹¥Ì¥ÍÑ¥¹ÐÉ½´½±¹Ù¥¹(½ÊræWræ÷VæVEöB2F7Fæ7Bg&öÒöÆBæ÷VæVEö@¢÷"éÙ]ËÚYÛ[ØXÝ]H\È\Ý[ÝÛHÛÚYÛ[ØXÝ]B'  or new.cleared_at is distinct from old.cleared_at
    t¡¸É¥ÍáÁÑ¥½¸ÕÑ¡¹Ñ¥Ñ±¥¹ÑÌµä½¹±äÉÍÁ¾væBFòÆææW"W66ÆFöç2s²VæBc°¢böÆBç7FGW3Òtõ	ÑSÈ[]ËÝ]\ÈÝ[
	ÐPÒÓÕÓQÑQ	Ë	ÔTÓÓQ	ÊHgn raise exception 'invalid escalation transition';
    elÍ¥½±¹ÍÑÑÕÌô-9=]1¹¹Ü¹ÍÑÑÕÌðøIM=1YwFVâ&6RW6WFöâvçfÆBW66ÆFöâG&ç6Föâs°¢	È[ÚYÛÝ]\ÏIÔTÓÓQ	È[]ËÝ]\ÏÔTÓÓQ	È'hen raise exception 'resolved escalation cannot be reopenä±¥¹Ðì¹¥ì(¥¹Ü¹ÍÑÑÕÌô-9=]1væBæWræ6¶æ÷vÆVFvVEöB2çVÆÂFVâæWræ6¶æ÷vÆVFvVEöCÖéÛÝÊ
NÈ[YÂY]ËÝ]\ÏIÔTÓÓQ	È[Y'btrim(coalesce(new.owner_response,''))='' then raise exceÁÑ¥½¸½Ý¹ÈÉÍÁ½¹ÍÉÅÕ¥ÉÑ¼ÉÍ½±ÙÍ±Ñ¥½¸ìºvBc°¢bæWrç&W6öÇfVEöB2çVÆÂFVâæWrç&W6öÇfVEùØ][ÝÊ
NÈ[YÂ[YÂ[YÂ]Ë\]YØ]gnow();
  return new;
end;
$$;
revoke all on function publ¥¹½µµ¹}Á±¹¹É}Í±Ñ¥½¹}ÕÉ ¤É½´ÁÕ±¥±¹½¸±ÖwFVçF6FVC°¦G&÷G&vvW"bW7G26öÖÖæE÷ÆææW%öW66ÉØ][ÛÙÝX\ÝYÙÙ\ÛXXËÛÛ[X[Ü[\Ù\ØØ[][Ûç;
create trigger command_planner_escalation_guard_trigger½ÉÕÁÑ½¸ÁÕ±¥¹½µµ¹}Á±¹¹É}Í±Ñ¥½¹Ì)½ÈvV6&÷rWV7WFRgVæ7FöâV&Æ2æ6öÖÖæE÷ÆææW%öW66ÆFÛÛÙÝX\

NÂÜX]HÜ\XÙH[Ý[ÛXXËÛÛ[X[Ügsolve_planner_escalation(p_escalation_id uuid,p_response ÑáÐ¤)ÉÑÕÉ¹Ì©Í½¹±¹ÕÁ±ÁÍÅ°ÍÕÉ¥Ñä¥¹Ù½­ÈÍÒr6V&6÷F×V&Æ2Çu÷FV× ¦2B@¦FV6Æ&Re÷VBWVC£Ò6YÛXÝ]]ZY

JNÈÜÝÈXXËÛÛ[X[Ü[\Ù\ØØ[][Û§s%rowtype;
begin
  if v_uid is null then raise exception ÕÑ¡¹Ñ¥Ñ¥½¸ÉÅÕ¥Éì¹¥ì(¥ÑÉ¥´¡½±Í¡Á~w&W7öç6RÂrrÒrrFVâ&6RW6WFöâv÷væW"&W7öç6R&WÝZ\Y	ÎÈ[YÂ\]HXXËÛÛ[X[Ü[\Ù\ØØ[][çns
  set status='RESOLVED',owner_response=p_response,reso±Ù}Ðõ¹½Ü ¤(Ý¡É¥õÁ}Í±Ñ¥½¹}¥¹ÕÍÉ}¥õÙ}Õ¦vBæB7FGW2âtõTârÂt4´äõtÄTDtTBr¢&WGW&æær¢çIÛÈÜÝÎÂYÝÝ[[Z\ÙH^Ù\[Û	ÛÜ[\ØØ[gtion not found'; end if;
  return to_jsonb(v_row);
end;
$ì)ÉÙ½­±°½¸Õ¹Ñ¥½¸ÁÕ±¥¹½µµ¹}ÉÍ½±Ù}Á±¹¹É~vW66ÆFöâWVBÇFWBg&öÒV&Æ2Ææöã°¦w&çBWV7WFRöâ	Ù[Ý[ÛXXËÛÛ[X[Ü\ÛÛWÜ[\Ù\ØØ[][Û]ZY'ext) to authenticated;
