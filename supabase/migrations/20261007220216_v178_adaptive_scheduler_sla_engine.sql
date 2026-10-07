
create table if not exists public.command_scheduler_poli¥Ì (¥ÕÕ¥ÁÉ¥µÉä­äÕ±Ð¹}É¹½µ}ÕÕ¥ ¤°(rW6W%öBWVBæ÷BçVÆÂ&VfW&Væ6W2WFçW6W'2BöâFVÆWIÙHØ\ØØYKÛXÞWÚÙ^H^Ý[\Ú[Û[YÙ\'not null default 1 check (version>=1),
  critical_slack_m¥¹ÕÑÌ¥¹ÑÈ¹½Ð¹Õ±°Õ±ÐÌÀ¡¬¡É¥Ñ¥±}Í±­~vÖçWFW2&WGvVVâæBÀ¢7FÆÅö×VÇFÆW"çVÖW&2ÍHÝ[Y][ÚXÚÈ
Ý[Û][\Y\]ÙY[§ 1 and 20),
  priority_sla_minutes jsonb not null defaultìäÔèØÀ°àÔèÄàÀ°ÜÀèÐàÀ°ÀèÄÐÐÁôèé©Í½¹°(ÑÍ­}Í²vöÖçWFW2§6öæ"æ÷BçVÆÂFVfVÇBw²$UdDTä4R#£RÂ%5åDU9ÒTÈÌSPSÑÐUHÓÔ×ÔPÒÐQÑHPHÌIÎÛÛ§,
  notes text not null default '',
  created_at timestamÁÑè¹½Ð¹Õ±°Õ±Ð¹½Ü ¤°(ÕÁÑ}ÐÑ¥µÍÑµÁÑè¹½ÐvçVÆÂFVfVÇBæ÷rÀ¢VæVRW6W%öBÇöÆ7ö¶W¢° ¦7&VÝHXHYÝ^\ÝÈXXËÛÛ[X[ÜØÚY[WÚ][\È
'id uuid primary key default gen_random_uuid(),
  user_id ÕÕ¥¹½Ð¹Õ±°ÉÉ¹ÌÕÑ ¹ÕÍÉÌ¡¥¤½¸±ÑÍrÀ¢ÆåöBWVBæ÷BçVÆÂ&VfW&Væ6W2V&Æ2æ6öÖÖæE÷Æç9ÊY
HÛ[]HØ\ØØYK\Ú×ÚY]ZYÝ[Y\[Ùgs public.command_plan_tasks(id) on delete cascade,
  assi¹}¹Ñ}¥ÕÕ¥ÉÉ¹ÌÁÕ±¥¹½µµ¹}¹ÑÌ¡¥¤¾vâFVÆWFR6WBçVÆÂÀ¢66VGVÆUö¶WFWBæ÷BçVÆÂÀ¢6÷W&6Y×Ù[Ù\[^Ý[XY[WÛÜYÚ[^Ýgll check (deadline_origin in ('PROJECT_DEADLINE','INTERVE9Q%=9}1%9°%9QI91}M1¤¤°(Í½ÕÉ}±¥¹}ÐÑ¦vÖW7F×G¢À¢F&vWE÷7F'EöBFÖW7F×G¢À¢GVUöBFÖW7IØ[\Ý[ÛWÛZ[]\È[YÙ\Ý[ÚXÚÈ
Ûg_minutes between 1 and 10080),
  age_minutes integer not ¹Õ±°Õ±ÐÀ¡¬¡}µ¥¹ÕÑÌøôÀ¤°(Í±­}µ¥¹ÕÑÌ¥ºwFVvW"æ÷BçVÆÂÀ¢W&vVæ7÷66÷&R6ÖÆÆçBæ÷BçVÆÂFVfVÇIÈÚXÚÈ
\Ù[ÞWÜØÛÜH]ÙY[[L
KÜ]XØ[Ügth boolean not null default false,
  dependency_state texÐ¹½Ð¹Õ±°Õ±ÐId(¡¬¡Á¹¹å}ÍÑÑ¥ºru$TErÂutDäuôDUTäDTä5rÂutDäuôTÔârÂtDôäRrÀ©ÈØ\XÚ]WÜÝ]H^Ý[Y][	ÐURSPIÂÚ'eck (capacity_state in ('AVAILABLE','BUSY','SATURATED','HU58¤¤°(Í¡Õ±}ÍÑÑÕÌÑáÐ¹½Ð¹Õ±°Õ±ÐId*r6V6²66VGVÆU÷7FGW2âu$TErÂutDäuôDUTäDTä9ÖIË	ÕÐRUS×ÒSPSË	ÔSSÉË	ÑÓIË	ÐPPÒQ	Ë	ÔÕSIÊJK'
  breach_state text not null default 'CLEAR'
    check (É¡}ÍÑÑ¥¸ 1H°Q}I%M,°	I!¤¤°(ÉÑ¥½ºvÆR§6öæ"æ÷BçVÆÂFVfVÇBw·Òs£¦§6öæ"À¢f'7E÷66VGVÆVI×Ø][Y\Ý[\Ý[Y][ÝÊ
K\ÝÜØÚY[Yçat timestamptz not null default now(),
  updated_at timesÑµÁÑè¹½Ð¹Õ±°Õ±Ð¹½Ü ¤°(Õ¹¥ÅÕ¡ÕÍÉ}¥±ÑÍ­}¥¤*r° ¦7&VFRF&ÆRbæ÷BW7G2V&Æ2æ6öÖÖæE÷66VGVÆW%öYÝ[È
Y]ZY[X\HÙ^HY][Ù[Ü[ÛWÝ]ZY

K§  user_id uuid not null references auth.users(id) on deleÑÍ°(Í¡Õ±}¥Ñµ}¥ÕÕ¥ÉÉ¹ÌÁÕ±¥¹½¶vÖæE÷66VGVÆUöFV×2BöâFVÆWFR6WBçVÆÂÀ¢ÆåöBWVÙÝ[Y\[Ù\ÈXXËÛÛ[X[Ü[ÊY
HÛ[]H'cascade,
  task_id uuid not null references public.comman}Á±¹}ÑÍ­Ì¡¥¤½¸±ÑÍ°(Ù¹Ñ}­äÑáÐ¹½ÐvçVÆÂÀ¢WfVçE÷GRFWBæ÷BçVÆÀ¢6V6²WfVçE÷GRéÈ
	ÔÐÒQSWÐÔPUQ	Ë	ÔSÔUWÐÒSÑQ	Ë	ÐUÔTÒÉË	ÐPPÒ'ED','STALL_DETECTED','CRITICAL_PATH','RECOVERED')),
  notÑáÐ¹½Ð¹Õ±°Õ±Ð°(Ù¥¹©Í½¹¹½Ð¹Õ±°vVÇBw·Òs£¦§6öæ"À¢7&VFVEöBFÖW7F×G¢æ÷BçVÆÂFVfYÛÝÊ
K[\]YJ\Ù\ÚY][ÚÙ^JBNÂÜX]H[^Y§ not exists command_schedule_items_user_status_idx
  on pÕ±¥¹½µµ¹}Í¡Õ±}¥ÑµÌ¡ÕÍÉ}¥±Í¡Õ±}ÍÑÑÕÌ±ÕÉvæ7÷66÷&RFW62ÆGVUöB62°¦7&VFRæFWbæ÷BW7G26ùÛ[X[ÜØÚY[WÚ][\×ØYÙ[ÚYÛXXËÛÛ[X[ÜØÚYgle_items(user_id,assigned_agent_id,schedule_status,due_atÍ¤ì)ÉÑ¥¹à¥¹½Ðá¥ÍÑÌ½µµ¹}Í¡Õ±É}Ù¹Òw5÷W6W%öG¢öâV&Æ2æ6öÖÖæE÷66VGVÆW%öWfVçG2W6W%öBÆ9ÜX]YØ]\ØÊNÂ[\XHXXËÛÛ[X[ÜØÚY[\Üçlicies enable row level security;
alter table public.comm¹}Í¡Õ±}¥ÑµÌ¹±É½Ü±Ù°ÍÕÉ¥Ñäì)±ÑÈÑ±rV&Æ2æ6öÖÖæE÷66VGVÆW%öWfVçG2Væ&ÆR&÷rÆWfVÂ6V7W&IÞNÂ]ÚÙH[ÛXXËÛÛ[X[ÜØÚY[\ÜÛXÚY\ÈÛH'anon,authenticated,service_role;
revoke all on public.comµ¹}Í¡Õ±}¥ÑµÌÉ½´¹½¸±ÕÑ¡¹Ñ¥Ñ±ÍÉÙ¥}É½±îp§&Wfö¶RÆÂöâV&Æ2æ6öÖÖæE÷66VGVÆW%öWfVçG2g&öÒæöâÉØ]][XØ]YÙ\XÙWÜÛNÂÜ[Ù[XÝÛXXËÛÛ[Xgnd_scheduler_policies to authenticated;
grant select on pÕ±¥¹½µµ¹}Í¡Õ±}¥ÑµÌÑ¼ÕÑ¡¹Ñ¥Ñì)É¹ÐÍ±v7BöâV&Æ2æ6öÖÖæE÷66VGVÆW%öWfVçG2FòWFVçF6FVC° ©ÙÜ[Ù[XÝ[Ù\\]HÛXXËÛÛ[X[ÜØÚY[\Üçlicies to service_role;
grant select,insert,update on pub±¥¹½µµ¹}Í¡Õ±}¥ÑµÌÑ¼ÍÉÙ¥}É½±ì)É¹ÐÍ±Ð²vç6W'BöâV&Æ2æ6öÖÖæE÷66VGVÆW%öWfVçG2Fò6W'f6U÷&öÆYÎÂÜÛXÞHY^\ÝÈÛÛ[X[ÜØÚY[\ÜÛXÚY\×ÜÙ[Xçt_own on public.command_scheduler_policies;
create policy½µµ¹}Í¡Õ±É}Á½±¥¥Í}Í±Ñ}½Ý¸½¸ÁÕ±¥¹½µµ¹~w66VGVÆW%÷öÆ6W0¦f÷"6VÆV7BFòWFVçF6FV@§W6ær6YÛXÝ]]ZY

JH\ÈÝ[[
Ù[XÝ]]ZY

JO]\Ù\§_id);

drop policy if exists command_schedule_items_selecÑ}½Ý¸½¸ÁÕ±¥¹½µµ¹}Í¡Õ±}¥ÑµÌì)ÉÑÁ½±¥ä½¶vÖæE÷66VGVÆUöFV×5÷6VÆV7Eö÷vâöâV&Æ2æ6öÖÖæE÷66VGVÆY×Ú][\ÂÜÙ[XÝÈ]][XØ]Y\Ú[È

Ù[XÝ]]Zgd()) is not null and (select auth.uid())=user_id);

drop Á½±¥ä¥á¥ÍÑÌ½µµ¹}Í¡Õ±É}Ù¹ÑÍ}Í±Ñ}½Ý¸½¸ÂwV&Æ2æ6öÖÖæE÷66VGVÆW%öWfVçG3°¦7&VFRöÆ76öÖÖæE÷66ÙY[\Ù][×ÜÙ[XÝÛÝÛÛXXËÛÛ[X[ÜØÚY[\Ù][§ts
for select to authenticated
using ((select auth.uid())¥Ì¹½Ð¹Õ±°¹¡Í±ÐÕÑ ¹Õ¥ ¤¤õÕÍÉ}¥¤ì()ÉÑ½Êr&WÆ6RgVæ7FöâV&Æ2æ6öÖÖæE÷66VGVÆUöFVÕöwV&B§&YÝ\ÈYÙÙ\[ÝXYÙHÜÜ[ÙXÝ\]H[ÚÙ\Ù]ÙX\çh_path=public,pg_temp
as $$
declare
  v_task public.comma¹}Á±¹}ÑÍ­ÌÉ½ÝÑåÁì(Ù}Á±¸ÁÕ±¥¹½µµ¹}Á±¹ÌÉ½ÝÒwS°¦&Vvà¢6VÆV7B¢çFòe÷F6°¢g&öÒV&Æ2æ6öÖÖæE÷	Û[Ý\ÚÜÂÚ\HY[]Ë\Ú×ÚY[[ÚY[]Ë[ÚY'and user_id=new.user_id;
  if not found then raise except¥½¸Í¡Õ±ÑÍ¬½Ý¹ÉÍ¡¥Àµ¥ÍµÑ ì¹¥ì((Í±Òr¢çFòe÷Æà¢g&öÒV&Æ2æ6öÖÖæE÷Æç0¢vW&RCÖæWyË[ÚY[\Ù\ÚY[]Ë\Ù\ÚYÂYÝÝ[[Zgse exception 'schedule plan ownership mismatch'; end if;
(¥¹Ü¹ÍÍ¥¹}¹Ñ}¥¥Ì¥ÍÑ¥¹ÐÉ½´Ù}ÑÍ¬¹ÍÍ¥væVEövVçEöBFVà¢&6RW6WFöâw66VGVÆR6ææ÷B&YØ\ÜÚYÛ[\]]Ü]IÎÂ[YÂY]ËÛÝ\ÙWÙ[§gerprint is distinct from v_task.source_fingerprint then
É¥ÍáÁÑ¥½¸Í¡Õ±¥¹ÉÁÉ¥¹ÐµÕÍÐµÑ Á±ºvæW"F6²s°¢VæBc° ¢be÷F6²æ6&ÆGö6Æ73ÒtTÔé×ÑPÒTÒSÓÈ[]ËØ\XÚ]WÜÝ]OÒSPSÈ[Z\Ùg exception 'human decision schedule must remain human-ownì(¹¥ì((¥¹Ü¹±¥¹}½É¥¥¸ô%9QI91}M1væBæWrç6÷W&6UöFVFÆæUöB2æ÷BçVÆÂFVà¢&6RW6YÜ[Û	Ú[\[ÓHX^HÝX\Ü]Y\YH\ÈHÛÝ\ÙHXYgne';
  end if;

  new.updated_at=now();
  return new;
endì(ì)ÉÙ½­±°½¸Õ¹Ñ¥½¸ÁÕ±¥¹½µµ¹}Í¡Õ±}¥Ñ¶uöwV&Bg&öÒV&Æ2ÆæöâÆWFVçF6FVC° ¦G&÷G&vvW"iÈ^\ÝÈÛÛ[X[ÜØÚY[WÚ][WÙÝX\ÝYÙÙ\ÛXXËÛÛgmand_schedule_items;
create trigger command_schedule_item}ÕÉ}ÑÉ¥È)½É¥¹ÍÉÐ½ÈÕÁÑ½¸ÁÕ±¥¹½µµ¹~w66VGVÆUöFV×0¦f÷"V6&÷rWV7WFRgVæ7FöâV&Æ2æ6öÖÖÛÜØÚY[WÚ][WÙÝX\

NÂ