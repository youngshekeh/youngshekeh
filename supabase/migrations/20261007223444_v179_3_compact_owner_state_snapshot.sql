
create or replace function public.command_load_owner_staÑ (Á}ÕÍÉ}¥ÕÕ¥°(Á}å±}ÑÑ(¤ÉÑÕÉ¹Ì©Í½¹p¦ÆæwVvR7À§7F&ÆP§6V7W&Gçfö¶W §6WB6V&6÷F×V)ÛXË×Ý[\\È		Ù[XÝÛÛØZ[ÛØXÝ
	ÙXÚ\çions',coalesce((select jsonb_agg(to_jsonb(x)) from public¹½µµ¹}¥Í¥½¹ÌàÝ¡Éà¹ÕÍÉ}¥õÁ}ÕÍÉ}¥¤°mtèé©Í¾væ"À¢vö&¦V7FfW2rÆ6öÆW66R6VÆV7B§6öæ%övrFõö§6öæ)Ê
JHÛHXXËÛÛ[X[ÛØXÝ]\ÈÚ\H\Ù\ÚY\Ýgser_id),'[]'::jsonb),
    'projects',coalesce((select jso¹}¡Ñ½}©Í½¹¡à¤¤É½´ÁÕ±¥¹½µµ¹}ÁÉ½©ÑÌàÝ¡ÉwçW6W%öC×÷W6W%öBÂuµÒs£¦§6öæ"À¢v'W6æW76W2rÆ6öÆYÜØÙJ
Ù[XÝÛÛØYÙÊ×ÚÛÛ
JHÛHXXËÛÛ[X[Øgsiness_units x where x.user_id=p_user_id),'[]'::jsonb),
 ÁÉ½ÕÑÌ±½±Í ¡Í±Ð©Í½¹}¡Ñ½}©Í½¹¡à¤¤É¾vÒV&Æ2æ6öÖÖæE÷&öGV7G2vW&RçW6W%öC×÷W6W%öBÂu¹×IÎÛÛK	ØÚ[[ÉËÛØ[\ØÙJ
Ù[XÝÛÛØYÙÊ×çjsonb(x)) from public.command_distribution_channels x wheÉà¹ÕÍÉ}¥õÁ}ÕÍÉ}¥¤°mtèé©Í½¹¤°(±±½Ñ¥½¹Ì±vöÆW66R6VÆV7B§6öæ%övrFõö§6öæ"g&öÒV&Æ2æ6öÖÖéÙÜ\ÛÝ\ÙWØ[ØØ][ÛÈÚ\H\Ù\ÚY\Ý\Ù\ÚY
K	Ö×IÎ§:jsonb),
    'outcomes',coalesce((select jsonb_agg(to_jso¹¡à¤¤É½´ÁÕ±¥¹½µµ¹}½ÕÑ½µÌàÝ¡Éà¹ÕÍÉ}¥õÁ}Öw6W%öBÂuµÒs£¦§6öæ"À¢vW7FærrÂ6VÆV7BFõö§6öæ"	ÙÛHXXËÛÛ[X[Ù^XÝ]]WØÞXÛ\ÈÚ\H\Ù\ÚY\çuser_id and x.cycle_date=p_cycle_date limit 1)
  );
$$;
rÙ½­±°½¸Õ¹Ñ¥½¸ÁÕ±¥¹½µµ¹}±½}½Ý¹É}ÍÑÑ¡ÕÕ¦vBÆFFRg&öÒV&Æ2ÆæöâÆWFVçF6FVC°¦w&çBWV7WFRöâ	Ù[Ý[ÛXXËÛÛ[X[ÛØYÛÝÛ\ÜÝ]J]ZY]JHÈÙgrvice_role;
