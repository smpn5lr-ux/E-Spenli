'use client'

import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Check, X } from "lucide-react"
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

export type LeaveRequest = {
  id: string
  path: string
  userName: string
  userRole: string
  type: "Izin" | "Sakit" | "Izin Pulang Cepat" | "Dinas Pagi" | "Dinas Siang" | "Dinas Full (1 Hari)"
  startDate: { toDate: () => Date }
  endDate: { toDate: () => Date }
  reason: string
}

export const columns = (handleUpdateRequest: (path: string, status: 'approved' | 'rejected') => void): ColumnDef<LeaveRequest>[] => [
  {
    accessorKey: "userName",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Nama
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "type",
    header: "Tipe",
  },
  {
    accessorKey: "startDate",
    header: "Tanggal Mulai",
    cell: ({ row }) => format(row.original.startDate.toDate(), 'dd MMMM yyyy', { locale: id })
  },
   {
    accessorKey: "endDate",
    header: "Tanggal Selesai",
    cell: ({ row }) => format(row.original.endDate.toDate(), 'dd MMMM yyyy', { locale: id })
  },
  {
    accessorKey: "reason",
    header: "Alasan",
    cell: ({ row }) => <div className="text-sm text-muted-foreground max-w-xs truncate">{row.original.reason}</div>
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const request = row.original
 
      return (
        <div className="flex gap-2">
            <Button variant="outline" size="sm" className="bg-green-50 hover:bg-green-100 text-green-700" onClick={() => handleUpdateRequest(request.path, 'approved')}>
                <Check className="h-4 w-4 mr-2"/> Setujui
            </Button>
            <Button variant="outline" size="sm" className="bg-red-50 hover:bg-red-100 text-red-700" onClick={() => handleUpdateRequest(request.path, 'rejected')}>
                <X className="h-4 w-4 mr-2"/> Tolak
            </Button>
        </div>
      )
    },
  },
]
