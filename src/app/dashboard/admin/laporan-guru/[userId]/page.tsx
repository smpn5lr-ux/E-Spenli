
import { adminDb as firestore } from '@/lib/firebase-admin';
import ReportClientShell from './ReportClientShell';
import { notFound } from 'next/navigation';
import { format, startOfMonth } from 'date-fns';

interface UserReportDetailPageProps {
  params: { userId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

async function getUserData(userId: string) {
  try {
    const userRef = firestore.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return null;
    }
    return { id: userSnap.id, ...userSnap.data() };
  } catch (error) {
    console.error(`Failed to fetch user ${userId} with Admin SDK:`, error);
    return null;
  }
}

export default async function UserReportDetailPage({ params, searchParams }: UserReportDetailPageProps) {
  const { userId } = params;
  const userData = await getUserData(userId);

  if (!userData) {
    notFound();
  }

  const monthParam = Array.isArray(searchParams.month) ? searchParams.month[0] : searchParams.month;
  const initialMonth = monthParam ? `${monthParam}-01` : format(startOfMonth(new Date()), 'yyyy-MM-dd');

  return (
    <ReportClientShell 
      userId={userId} 
      initialUserData={userData}
      initialMonth={initialMonth}
    />
  );
}
