'use client';

import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

// --- Type Definitions ---
interface ReportItem {
  id: string; // yyyy-MM-dd
  date: Date;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  statusKey: string;
  raw: any; // Raw data from Firestore
}

interface ReportViewProps {
  item: ReportItem;
  onEdit: (item: ReportItem) => void; // Function to handle editing a single day
}

// Mapping from statusKey to human-readable status and color
const statusMap: { [key: string]: { label: string; color: string } } = {
    present: { label: 'Hadir', color: 'bg-green-100 text-green-800' },
    late: { label: 'Terlambat', color: 'bg-yellow-100 text-yellow-800' },
    permission: { label: 'Izin/Sakit', color: 'bg-blue-100 text-blue-800' },
    official_duty: { label: 'Dinas', color: 'bg-indigo-100 text-indigo-800' },
    absent: { label: 'Alpa', color: 'bg-red-100 text-red-800' },
    no_check_out: { label: 'Tidak Pulang', color: 'bg-amber-100 text-amber-800' },
};


const ReportView = ({ item, onEdit }: ReportViewProps) => {

    const dateString = format(item.date, 'EEEE, dd MMMM yyyy', { locale: id });
    const checkInString = item.checkInTime ? format(item.checkInTime, 'HH:mm') : '-';
    const checkOutString = item.checkOutTime ? format(item.checkOutTime, 'HH:mm') : '-';

    const statusInfo = statusMap[item.statusKey] || { label: 'Unknown', color: 'bg-gray-100 text-gray-800' };
    const isEditable = item.statusKey === 'absent';

    return (
        <TableRow>
            <TableCell className="font-medium">{dateString}</TableCell>
            <TableCell className="text-center">{checkInString}</TableCell>
            <TableCell className="text-center">{checkOutString}</TableCell>
            <TableCell>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                    {statusInfo.label}
                </span>
            </TableCell>
            <TableCell>{item.raw?.reason || '-'}</TableCell>
            <TableCell className="text-right">
                {isEditable && (
                    <Button variant="ghost" size="icon" onClick={() => onEdit(item)} title="Perbaiki status Alpa">
                        <Pencil className="h-4 w-4" />
                    </Button>
                )}
            </TableCell>
        </TableRow>
    );
}

export default ReportView;
