import { 
  Box, 
  Stack, 
  Flex, 
  Text, 
  Badge, 
  IconButton
} from '@chakra-ui/react';
import { Tooltip } from '../ui/tooltip';
import { Edit, Trash, Check, FileText } from 'lucide-react';

interface FileListProps {
  files: string[];
  selectedFile: string;
  activeConfigPath?: string;
  onFileSelect: (filename: string) => void;
  onRenameClick: (filename: string) => void;
  onDeleteClick: (filename: string) => void;
  onSetActiveConfig?: (filename: string) => void;
  isLoading: boolean;
  hideActiveConfig?: boolean;
}

export function FileList({
  files = [],
  selectedFile,
  activeConfigPath = '',
  onFileSelect,
  onRenameClick,
  onDeleteClick,
  onSetActiveConfig,
  isLoading,
  hideActiveConfig = false
}: FileListProps) {
  const getFilenameFromPath = (path: string) => {
    return path.split('/').pop() || '';
  };
  
  const activeConfigFilename = getFilenameFromPath(activeConfigPath);

  return (
    <Box 
      width="100%" 
      bg="bg.surface" 
      p={4} 
      borderRadius="md" 
      borderWidth="1px"
      height="100%"
      overflowY="auto"
    >
      {isLoading ? (
        <Text>Loading files...</Text>
      ) : files.length === 0 ? (
        <Text>No config files found</Text>
      ) : (
        <Stack gap={2} direction="column" width="100%">
          {files.map((filename) => (
            <Box 
              key={filename}
              p={2}
              borderRadius="md"
              bg={selectedFile === filename ? 'blue.muted' : 'transparent'}
              borderBottom="1px solid"
              borderBottomColor="border.DEFAULT"
              mb={1}
              _hover={{ bg: 'bg.muted' }}
              cursor="pointer"
              onClick={() => onFileSelect(filename)}
            >
              <Flex 
                justifyContent="space-between" 
                alignItems="center"
                flexDirection={{ base: 'column', sm: 'row' }}
                gap={{ base: 2, sm: 0 }}
              >
                <Flex 
                  alignItems="center" 
                  flex={1} 
                  width={{ base: '100%', sm: 'auto' }}
                  justifyContent={{ base: 'center', sm: 'flex-start' }}
                >
                  <FileText size={16} style={{ marginRight: '8px' }} />
                  <Text fontWeight={selectedFile === filename ? 'bold' : 'normal'}>
                    {filename}
                  </Text>
                  {!hideActiveConfig && filename === activeConfigFilename && (
                    <Badge ml={2} colorPalette="green">Active</Badge>
                  )}
                </Flex>
                <Flex 
                  width={{ base: '100%', sm: 'auto' }}
                  justifyContent={{ base: 'center', sm: 'flex-end' }}
                >
                  {!hideActiveConfig && onSetActiveConfig && filename !== activeConfigFilename && (
                    <Tooltip content="Set as active config">
                      <IconButton
                        aria-label="Set as active"
                        size="sm"
                        colorPalette="green"
                        variant="ghost"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          onSetActiveConfig(filename);
                        }}
                      >
                        <Check size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip content="Rename file">
                    <IconButton
                      aria-label="Rename file"
                      size="sm"
                      colorPalette="blue"
                      variant="ghost"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onRenameClick(filename);
                      }}
                    >
                      <Edit size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Delete file">
                    <IconButton
                      aria-label="Delete file"
                      size="sm"
                      colorPalette="red"
                      variant="ghost"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onDeleteClick(filename);
                      }}
                    >
                      <Trash size={16} />
                    </IconButton>
                  </Tooltip>
                </Flex>
              </Flex>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
