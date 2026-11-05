import {useLocation,Navigate} from 'react-router-dom';
import {ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useHasRoleState} from '@/hooks/useHasRole';
import {ADMIN_LAUNCHERS,retiredAdminDestination} from '@/lib/admin-navigation';
import logo from '@/assets/tidy-official-logo.png';
export default function AdminServiceHandoff(){
 const {pathname}=useLocation();const {hasRole,isLoading}=useHasRoleState('admin');
 if(isLoading)return <main className="admin-page p-8">Loading…</main>;if(!hasRole)return <Navigate to="/login" replace/>;
 const service=retiredAdminDestination(pathname)??'Connecteam';const url=ADMIN_LAUNCHERS.find(l=>l.label===`Open ${service}`)?.url;
 return <main className="admin-page px-5 py-12"><div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-8 text-center"><img src={logo} alt="Tidy" className="mx-auto mb-6 h-20 w-auto"/><h1 className="text-2xl font-semibold text-foreground">This now lives in {service}</h1><p className="my-4 text-muted-foreground">{service==='Connecteam'?'Hiring, paperwork, shifts, visit reports and photos are in the Tidy app.':service==='Jobber'?'Customers, jobs and the schedule are in Jobber.':'Catalog and billing setup are in Stripe. Historical records remain saved.'}</p><Button asChild className="bg-gold text-gold-foreground hover:bg-gold/90"><a href={url} target="_blank" rel="noopener noreferrer">Open {service}<ExternalLink className="ml-2 h-5 w-5"/></a></Button></div></main>;
}
