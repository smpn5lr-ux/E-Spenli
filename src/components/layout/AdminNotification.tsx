'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDoc, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminNotificationData {
    title: string;
    message: string;
    isActive: boolean;
    duration: number;
}

export function AdminNotification() {
    const { user } = useUser();
    const firestore = useFirestore();

    // Reference to the school configuration document
    const schoolConfigRef = useMemoFirebase(() => 
        firestore ? doc(firestore, 'schoolConfig', 'default') : null, 
        [firestore]
    );

    // Fetch the notification data in real-time
    const { data: schoolConfig } = useDoc<{
        adminNotification?: AdminNotificationData;
    }>(user, schoolConfigRef);

    const notification = useMemo(() => schoolConfig?.adminNotification, [schoolConfig]);

    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Only show the notification if it's active and has content
        if (notification?.isActive && notification.title && notification.message) {
            setIsVisible(true);

            // Set a timer to auto-hide the notification
            const durationInMs = (notification.duration || 10) * 1000;
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, durationInMs);

            // Cleanup the timer if the component unmounts or the notification changes
            return () => clearTimeout(timer);
        } else {
            // If the notification is deactivated by the admin, hide it immediately
            setIsVisible(false);
        }
    }, [notification]); // This effect re-runs whenever the notification data changes in Firestore

    const handleClose = () => {
        setIsVisible(false);
    };

    if (!isVisible || !notification) {
        return null;
    }

    return (
        <div className={cn(
            "fixed top-5 left-1/2 -translate-x-1/2 w-[90%] max-w-lg z-[100] transition-all duration-500 ease-in-out",
            isVisible ? "translate-y-0 opacity-100" : "-translate-y-20 opacity-0"
        )}>
            <Card className="overflow-hidden shadow-2xl bg-card/95 backdrop-blur-sm border-primary/20">
                <CardHeader className="flex flex-row items-start gap-4 p-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Megaphone className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                        <CardTitle className="text-base font-semibold leading-tight">{notification.title}</CardTitle>
                        <CardDescription className="mt-1 text-sm">{notification.message}</CardDescription>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={handleClose}
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Tutup</span>
                    </Button>
                </CardHeader>
            </Card>
        </div>
    );
}
