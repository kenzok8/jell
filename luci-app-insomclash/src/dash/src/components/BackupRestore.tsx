import { useState, useRef } from 'react';
import { Box, Button, VStack, HStack, Text, Heading } from '@chakra-ui/react';
import { Download, Upload, AlertTriangle } from 'lucide-react';
import { showSuccess, showError } from '../utils/notification';
import { API_BASE_URL } from '../config/api';

export function BackupRestore() {
    const [isCreating, setIsCreating] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCreateBackup = async () => {
        setIsCreating(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/backup/create`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to create backup');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            const contentDisposition = response.headers.get('Content-Disposition');
            const filename = contentDisposition
                ? contentDisposition.split('filename=')[1]
                : `fusiontunx-backup-${new Date().toISOString().split('T')[0]}.tar.gz`;

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showSuccess('Backup created successfully');
        } catch (error) {
            console.error('Backup error:', error);
            showError('Failed to create backup');
        } finally {
            setIsCreating(false);
        }
    };

    const handleFileSelect = () => {
        fileInputRef.current?.click();
    };

    const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.tar.gz')) {
            showError('Please select a valid backup file (.tar.gz)');
            return;
        }

        const confirmed = window.confirm(
            'Are you sure you want to restore this backup? This will overwrite all files in the working directory.'
        );

        if (!confirmed) {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            return;
        }

        setIsRestoring(true);
        try {
            const formData = new FormData();
            formData.append('backup', file);

            const response = await fetch(`${API_BASE_URL}/api/v1/backup/restore`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to restore backup');
            }

            showSuccess('Backup restored successfully. Please restart Mihomo service.');
        } catch (error) {
            console.error('Restore error:', error);
            showError(error instanceof Error ? error.message : 'Failed to restore backup');
        } finally {
            setIsRestoring(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <VStack gap={6} align="stretch">
            <Box
                p={6}
                borderRadius="lg"
                borderWidth="1px"
                borderColor="border.DEFAULT"
                bg="bg.subtle"
            >
                <HStack mb={4}>
                    <Download size={20} />
                    <Heading size="md">Create Backup</Heading>
                </HStack>
                <Text color="fg.muted" mb={4}>
                    Download a complete backup of your FusionTunX configuration including all configs, proxy providers, and rule providers.
                </Text>
                <Button
                    onClick={handleCreateBackup}
                    disabled={isCreating}
                    colorPalette="blue"
                    size="lg"
                >
                    {isCreating ? 'Creating Backup...' : 'Download Backup'}
                </Button>
            </Box>

            <Box
                p={6}
                borderRadius="lg"
                borderWidth="1px"
                borderColor="border.DEFAULT"
                bg="bg.subtle"
            >
                <HStack mb={4}>
                    <Upload size={20} />
                    <Heading size="md">Restore from Backup</Heading>
                </HStack>
                <Text color="fg.muted" mb={4}>
                    Upload a backup file to restore your configuration. This will overwrite all existing files.
                </Text>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".tar.gz"
                    onChange={handleRestoreBackup}
                    style={{ display: 'none' }}
                />

                <Button
                    onClick={handleFileSelect}
                    disabled={isRestoring}
                    colorPalette="green"
                    size="lg"
                >
                    {isRestoring ? 'Restoring...' : 'Choose Backup File'}
                </Button>
            </Box>

            <Box
                p={4}
                borderRadius="lg"
                borderWidth="1px"
                borderColor="orange.500"
                bg="orange.50"
                _dark={{ bg: "orange.950" }}
            >
                <HStack>
                    <AlertTriangle size={20} color="orange" />
                    <Text fontSize="sm" color="orange.700" _dark={{ color: "orange.300" }}>
                        <strong>Warning:</strong> Restoring a backup will overwrite all files in the working directory.
                        Make sure to create a backup before restoring if you want to preserve your current configuration.
                    </Text>
                </HStack>
            </Box>
        </VStack>
    );
}
