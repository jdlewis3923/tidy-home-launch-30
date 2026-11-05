import {Activity,Bell,Users,Gift,Star,House,Wallet,ShieldCheck,PackageCheck,Landmark,Megaphone,Settings,Heart,Power,CalendarDays,Mail,BookOpen,Inbox,BarChart3,QrCode} from 'lucide-react';
export const ADMIN_LAUNCHERS=[{label:'Open Jobber',url:'https://secure.getjobber.com/'},{label:'Open Connecteam',url:'https://app.connecteam.com/'},{label:'Open QuickBooks',url:'https://qbo.intuit.com/'},{label:'Open Stripe',url:'https://dashboard.stripe.com/'}];
export const ADMIN_GROUPS=[
 {label:'Today',icon:Activity,items:[{to:'/admin/command',label:'Command center',icon:House},{to:'/admin/alerts',label:'Alerts',icon:Bell,badge:'alerts' as const},{to:'/admin/digest',label:'Daily digest',icon:Mail}]},
 {label:'Customers & Plans',icon:Users,items:[{to:'/admin/members',label:'Members in Jobber',icon:Users},{to:'/admin/reservations',label:'Plans & reservations',icon:House},{to:'/admin/entitlements',label:'Free add-ons',icon:Gift},{to:'/admin/founding',label:'Founding homes',icon:House},{to:'/admin/leads',label:'Leads',icon:Users},{to:'/admin/inbox',label:'Customer inbox',icon:Inbox},{to:'/admin/reviews',label:'Reviews',icon:Star},{to:'/admin/size-review',label:'Size reviews',icon:House},{to:'/admin/lawn-verification',label:'Lawn measurements',icon:House}]},
 {label:'Pros & Pay',icon:Wallet,items:[{to:'/admin/pro-pay',label:'Pro Pay',icon:Wallet},{to:'/admin/pro-pay#reviews',label:'Review bonuses',icon:Star},{to:'/admin/pro-pay#insurance',label:'Insurance status',icon:ShieldCheck},{to:'/admin/badges',label:'Badges',icon:ShieldCheck},{to:'/admin/pro-kits',label:'Pro kits',icon:PackageCheck}]},
 {label:'Money',icon:Landmark,items:[{to:'/admin/costs',label:'Costs',icon:Wallet},{to:'/admin/health#integrations',label:'Stripe & billing health',icon:Heart},{to:'/admin/kpis',label:'Business results',icon:BarChart3}]},
 {label:'Marketing',icon:Megaphone,items:[{to:'/admin/social',label:'Social calendar',icon:CalendarDays},{to:'/admin/demand',label:'Demand',icon:BarChart3},{to:'/admin/qr',label:'Door-hanger QR',icon:QrCode}]},
 {label:'Settings & Health',icon:Settings,items:[{to:'/admin/site-status',label:'Site status',icon:Power},{to:'/admin/launch-dates',label:'Launch dates',icon:CalendarDays},{to:'/admin/health',label:'Integrations health',icon:Heart},{to:'/admin/settings/notifications',label:'Notification settings',icon:Bell},{to:'/admin/service-scope',label:'Service scope',icon:BookOpen},{to:'/admin/documents',label:'Guides & documents',icon:BookOpen},{to:'/admin/chatbot-knowledge',label:'Chatbot knowledge',icon:BookOpen}]}
];
export function retiredAdminDestination(path:string):'Connecteam'|'Jobber'|'Stripe'|null{
 const ct=['hiring','pipeline','applicants','onboarding','orientations','pro-tracker','signing-day','pro-assignments','photos','coi-review','insurance','documenso-templates','messages'];
 if(ct.some(p=>path===`/admin/${p}`||path.startsWith(`/admin/${p}/`)))return 'Connecteam';
 if(['schedule','calendar','reschedules','capacity','members'].some(p=>path===`/admin/${p}`))return 'Jobber';
 if(['test-zapier','setup-catalog','setup-check'].some(p=>path===`/admin/${p}`))return 'Stripe';
 return null;
}
