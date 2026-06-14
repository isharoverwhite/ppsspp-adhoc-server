'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getSetting(key: string) {
    try {
        const s = await prisma.setting.findUnique({ where: { key } });
        return { success: true, value: s?.value || '' };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function setSetting(key: string, value: string) {
    try {
        await prisma.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });
        revalidatePath('/admin/monitoring');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
