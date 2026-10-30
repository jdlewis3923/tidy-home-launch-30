import { memberScopeRows, visitScopes } from './scope.ts';
export async function visitRedoScope(admin:any, visit:{id:string;user_id:string|null;service_type:string|null;visit_kind:string|null}) {
 const rows=await memberScopeRows(admin,visit.user_id,visitScopes(visit.service_type,visit.visit_kind));
 const {data:deep}=await admin.from('addon_attaches').select('id').eq('visit_id',visit.id).eq('addon_key','deep_clean').eq('status','completed').limit(1).maybeSingle();
 if(!deep)return rows;
 const {data:added,error}=await admin.from('service_scope').select('service,section,text_en,text_es,group_en,group_es,notice_key,sort_order').eq('active',true).eq('addon_key','deep_clean');
 if(error)throw error;
 return [...rows,...(added??[]).map((r:any)=>({...r,section:'included'}))];
}