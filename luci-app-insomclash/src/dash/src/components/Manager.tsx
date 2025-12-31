import { useState, useEffect } from 'react';
import { 
  Box, 
  Heading, 
  Button, 
  Flex,
} from '@chakra-ui/react';
import { Plus, RefreshCw, Upload } from 'lucide-react';
import { showSuccess, showError, showWarning } from '../utils/notification';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import { FileList } from './manager/FileList';
import { FileEditor } from './manager/FileEditor';
import { CreateFileModal } from './manager/CreateFileModal';
import { RenameFileModal } from './manager/RenameFileModal';
import { DeleteConfirmModal } from './manager/DeleteConfirmModal';
import { UploadFileModal } from './manager/UploadFileModal';

interface ManagerProps {
  type: 'configs' | 'proxy_providers' | 'rule_providers';
  title?: string;
}

export function Manager({ type, title }: ManagerProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [activeConfigPath, setActiveConfigPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fileToRename, setFileToRename] = useState<string>('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Toast function using notification utility
  const showToast = (title: string, description: string, status: 'success' | 'error' | 'warning' | 'info') => {
    switch (status) {
      case 'success':
        showSuccess(title, { description });
        break;
      case 'error':
        showError(title, { description });
        break;
      case 'warning':
        showWarning(title, { description });
        break;
      default:
        showSuccess(title, { description });
    }
  };

  const onCreateOpen = () => setIsCreateOpen(true);
  const onCreateClose = () => setIsCreateOpen(false);
  
  const onRenameOpen = () => setIsRenameOpen(true);
  const onRenameClose = () => setIsRenameOpen(false);

  const onUploadOpen = () => setIsUploadOpen(true);
  const onUploadClose = () => setIsUploadOpen(false);

  const onDeleteOpen = () => setIsDeleteOpen(true);
  const onDeleteClose = () => setIsDeleteOpen(false);

  useEffect(() => {
    fetchFiles();
    if (type === 'configs') {
      fetchActiveConfigPath();
    }
  }, [type]);

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      let endpoint = '';
      let errorMessage = '';
      
      switch (type) {
        case 'configs':
          endpoint = API_ENDPOINTS.mihomo.configs;
          errorMessage = 'Failed to fetch config files';
          break;
        case 'proxy_providers':
          endpoint = API_ENDPOINTS.mihomo.proxyProviders;
          errorMessage = 'Failed to fetch proxy provider files';
          break;
        case 'rule_providers':
          endpoint = API_ENDPOINTS.mihomo.ruleProviders;
          errorMessage = 'Failed to fetch rule provider files';
          break;
      }
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      if (!response.ok) throw new Error(errorMessage);
      const data = await response.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(`Error fetching ${type} files:`, error);
      showToast('Error', `Failed to fetch ${type} files`, 'error');
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActiveConfigPath = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.mihomo.activeConfig}`);
      if (!response.ok) throw new Error('Failed to fetch active config path');
      const data = await response.json();
      if (data.success && data.data && data.data.active_config) {
        setActiveConfigPath(data.data.active_config);
      }
    } catch (error) {
      console.error('Error fetching active config path:', error);
    }
  };

  const fetchFileContent = async (filename: string) => {
    setIsLoading(true);
    try {
      let endpoint = '';
      
      switch (type) {
        case 'configs':
          endpoint = API_ENDPOINTS.mihomo.configFile(filename);
          break;
        case 'proxy_providers':
          endpoint = API_ENDPOINTS.mihomo.proxyProviderFile(filename);
          break;
        case 'rule_providers':
          endpoint = API_ENDPOINTS.mihomo.ruleProviderFile(filename);
          break;
      }
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      if (!response.ok) throw new Error('Failed to fetch file content');
      const data = await response.json();
      setFileContent(data.content);
      setSelectedFile(filename);
      setIsEditing(false);
    } catch (error) {
      console.error('Error fetching file content:', error);
      showToast('Error', 'Failed to fetch file content', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const createNewFile = async (filename: string, content: string) => {
    if (!filename) {
      showToast('Error', 'Filename cannot be empty', 'error');
      return;
    }

    const finalFilename = !filename.endsWith('.yaml') && !filename.endsWith('.yml') 
      ? filename + '.yaml' 
      : filename;

    try {
      let endpoint = '';
      
      switch (type) {
        case 'configs':
          endpoint = API_ENDPOINTS.mihomo.configs;
          break;
        case 'proxy_providers':
          endpoint = API_ENDPOINTS.mihomo.proxyProviders;
          break;
        case 'rule_providers':
          endpoint = API_ENDPOINTS.mihomo.ruleProviders;
          break;
      }
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: finalFilename,
          content: content,
        }),
      });

      if (!response.ok) throw new Error('Failed to create file');

      showToast('Success', 'File created successfully', 'success');
      fetchFiles();
    } catch (error) {
      console.error('Error creating file:', error);
      showToast('Error', 'Failed to create file', 'error');
    }
  };

  const saveFileContent = async () => {
    try {
      let endpoint = '';
      
      switch (type) {
        case 'configs':
          endpoint = API_ENDPOINTS.mihomo.configFile(selectedFile);
          break;
        case 'proxy_providers':
          endpoint = API_ENDPOINTS.mihomo.proxyProviderFile(selectedFile);
          break;
        case 'rule_providers':
          endpoint = API_ENDPOINTS.mihomo.ruleProviderFile(selectedFile);
          break;
      }
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: fileContent,
        }),
      });

      if (!response.ok) throw new Error('Failed to save file');

      showToast('Success', 'File saved successfully', 'success');

      setIsEditing(false);
    } catch (error) {
      console.error('Error saving file:', error);
      showToast('Error', 'Failed to save file', 'error');
    }
  };

  const handleRenameClick = (filename: string) => {
    setFileToRename(filename);
    onRenameOpen();
  };

  const handleRenameFile = async (newName: string) => {
    if (!newName) {
      showToast('Error', 'New filename cannot be empty', 'error');
      return;
    }

    const finalNewName = !newName.endsWith('.yaml') && !newName.endsWith('.yml') 
      ? newName + '.yaml' 
      : newName;

    try {
      let endpoint = '';
      
      switch (type) {
        case 'configs':
          endpoint = API_ENDPOINTS.mihomo.configRename(fileToRename);
          break;
        case 'proxy_providers':
          endpoint = API_ENDPOINTS.mihomo.proxyProviderRename(fileToRename);
          break;
        case 'rule_providers':
          endpoint = API_ENDPOINTS.mihomo.ruleProviderRename(fileToRename);
          break;
      }
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_filename: finalNewName,
        }),
      });

      if (!response.ok) throw new Error('Failed to rename file');

      showToast('Success', 'File renamed successfully', 'success');

      fetchFiles();
      if (type === 'configs') {
        fetchActiveConfigPath();
      }
      
      if (selectedFile === fileToRename) {
        setSelectedFile(finalNewName);
      }

      onRenameClose();
    } catch (error) {
      console.error('Error renaming file:', error);
      showToast('Error', 'Failed to rename file', 'error');
    }
  };

  const deleteFile = (filename: string) => {
    setFileToDelete(filename);
    onDeleteOpen();
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    
    setIsDeleting(true);
    try {
      let endpoint = '';
      
      switch (type) {
        case 'configs':
          endpoint = API_ENDPOINTS.mihomo.configFile(fileToDelete);
          break;
        case 'proxy_providers':
          endpoint = API_ENDPOINTS.mihomo.proxyProviderFile(fileToDelete);
          break;
        case 'rule_providers':
          endpoint = API_ENDPOINTS.mihomo.ruleProviderFile(fileToDelete);
          break;
      }
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete file');

      showToast('Success', 'File deleted successfully', 'success');
      fetchFiles();
      if (type === 'configs') {
        fetchActiveConfigPath();
      }
      
      if (selectedFile === fileToDelete) {
        setSelectedFile('');
        setFileContent('');
      }
      
      onDeleteClose();
    } catch (error) {
      console.error('Error deleting file:', error);
      showToast('Error', 'Failed to delete file', 'error');
    } finally {
      setIsDeleting(false);
    }
  };


  const setActiveConfig = async (filename: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.mihomo.activeConfig}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: filename,
        }),
      });

      if (!response.ok) throw new Error('Failed to set active config');

      showToast('Success', 'Active config updated successfully', 'success');

      fetchActiveConfigPath();
    } catch (error) {
      console.error('Error setting active config:', error);
      showToast('Error', 'Failed to set active config', 'error');
    }
  };

  return (
    <Box>
      <Flex 
        justifyContent="space-between" 
        alignItems={{ base: 'flex-start', sm: 'center' }} 
        mb={4}
        flexDirection={{ base: 'column', sm: 'row' }}
        gap={{ base: 2, sm: 0 }}
      >
        <Heading size="lg">{title || (type === 'configs' ? 'Config Files' : type === 'proxy_providers' ? 'Proxy Provider Files' : 'Rule Provider Files')}</Heading>
        <Flex gap={2} flexWrap="wrap">
          <Button 
            colorPalette="blue" 
            size={{base: "2xs", md: "xs"}}
            fontSize={{base: "xs", md: "sm"}}
            onClick={fetchFiles}
            disabled={isLoading}
          >
            <RefreshCw size={12} style={{ marginRight: '4px' }} />
            Refresh
          </Button>
          <Button 
            colorPalette="green" 
            size={{base: "2xs", md: "xs"}}
            fontSize={{base: "xs", md: "sm"}}
            onClick={onCreateOpen}
          >
            <Plus size={12} style={{ marginRight: '4px' }} />
            New {type === 'configs' ? 'Config' : type === 'proxy_providers' ? 'Proxy' : 'Rule'}
          </Button>
          <Button 
            colorPalette="cyan" 
            size={{base: "2xs", md: "xs"}}
            fontSize={{base: "xs", md: "sm"}}
            onClick={onUploadOpen}
          >
            <Upload size={12} style={{ marginRight: '4px' }} />
            Upload {type === 'configs' ? 'Config' : type === 'proxy_providers' ? 'Proxy' : 'Rule'}
          </Button>
        </Flex>
      </Flex>

      <Flex gap={6} direction={{ base: 'column', lg: 'row' }} height="calc(100vh - 200px)">
        <Box width={{ base: '100%', lg: '30%' }} height="100%">
          <FileList 
            files={files} 
            selectedFile={selectedFile} 
            onFileSelect={fetchFileContent} 
            onRenameClick={handleRenameClick} 
            onDeleteClick={deleteFile} 
            activeConfigPath={type === 'configs' ? activeConfigPath : undefined}
            onSetActiveConfig={type === 'configs' ? setActiveConfig : undefined}
            hideActiveConfig={type !== 'configs'}
            isLoading={isLoading}
          />
        </Box>
        <Box width={{ base: '100%', lg: '70%' }} height="100%">
          <FileEditor 
            fileContent={fileContent}
            selectedFile={selectedFile}
            isEditing={isEditing}
            isLoading={isLoading}
            onEditClick={() => setIsEditing(true)}
            onCancelEdit={() => setIsEditing(false)}
            onSaveClick={saveFileContent}
            onContentChange={(value) => value !== undefined && setFileContent(value)}
          />
        </Box>
      </Flex>

      <CreateFileModal
        isOpen={isCreateOpen}
        onClose={onCreateClose}
        onCreateFile={createNewFile}
        title={`Create New ${type === 'configs' ? 'Config' : type === 'proxy_providers' ? 'Proxy Provider' : 'Rule Provider'}`}
        placeholder={`Enter ${type === 'configs' ? 'config' : type === 'proxy_providers' ? 'proxy provider' : 'rule provider'} content`}
        defaultContent={type === 'proxy_providers' ? 'proxies:\n  - name: Example\n    type: http\n    server: example.com\n    port: 7890' : ''}
      />
      
      <RenameFileModal
        isOpen={isRenameOpen}
        onClose={onRenameClose}
        onRenameFile={handleRenameFile}
        currentFileName={fileToRename}
      />
      
      <UploadFileModal
        isOpen={isUploadOpen}
        onClose={onUploadClose}
        onSuccess={fetchFiles}
        uploadEndpoint={`${API_BASE_URL}${type === 'configs' ? API_ENDPOINTS.mihomo.configs : type === 'proxy_providers' ? API_ENDPOINTS.mihomo.proxyProviders : API_ENDPOINTS.mihomo.ruleProviders}/upload`}
        title={`Upload ${type === 'configs' ? 'Config' : type === 'proxy_providers' ? 'Proxy Provider' : 'Rule Provider'}`}
      />
      
      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        onClose={onDeleteClose}
        onConfirm={confirmDeleteFile}
        fileName={fileToDelete}
        isLoading={isDeleting}
      />
    </Box>
  );
}
