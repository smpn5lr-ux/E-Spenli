'use client';

import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, AlertCircle, CheckCircle, UserCheck, ShieldCheck, UserX, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

const statusConfig: { [key: string]: { text: string; variant: "default" | "destructive" | "secondary"; icon?: React.ReactNode } } = {
    present:        { text: 'Hadir',         variant: 'default',     icon: <CheckCircle className="h-3 w-3" /> },
    late:           { text: 'Terlambat',     variant: 'destructive', icon: <Clock className="h-3 w-3" /> },
    absent:         { text: 'Alpa',          variant: 'destructive', icon: <UserX className="h-3 w-3" /> },
    sick:           { text: 'Sakit',         variant: 'secondary',   icon: <AlertCircle className="h-3 w-3" /> },
    permission:     { text: 'Izin',          variant: 'secondary',   icon: <UserCheck className="h-3 w-3" /> },
    official_duty:  { text: 'Dinas',         variant: 'secondary',   icon: <ShieldCheck className="h-3 w-3" /> },
    no_check_out:   { text: 'Tidak Pulang',  variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
};

interface ReportViewProps {
    item: {
        id: string;
        date: Date;
        checkInTime: Date | null;
        checkOutTime: Date | null;
        statusKey: string;
        raw: any;
    };
    onEdit: (item: any) => void;
}

export default function ReportView({ item, onEdit }: ReportViewProps) {
    const config = statusConfig[item.statusKey] || { text: 'N/A', variant: 'secondary' };

    return (
        <TableRow>
            <TableCell className="font-medium">{format(item.date, 'EEEE, dd MMMM yyyy', { locale: id })}</TableCell>
            <TableCell>{item.checkInTime ? format(item.checkInTime, 'HH:mm') : '-'}</TableCell>
            <TableCell>{item.checkOutTime ? format(item.checkOutTime, 'HH:mm') : '-'}</TableCell>
            <TableCell>
                <Badge variant={config.variant} className="flex items-center w-fit gap-1 capitalize">
                    {config.icon}
                    <span>{config.text}</span>
                </Badge>
            </TableCell>
            <TableCell className="max-w-[200px] truncate">{item.raw?.reason || item.raw?.description || '-'}</TableCell>
            <TableCell className="text-right">
                <Button variant="outline" size="icon" onClick={() => onEdit(item)}>
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Perbaiki</span>
                </Button>
            </TableCell>
        </TableRow>
    );
}
