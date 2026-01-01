import { Box, Button, Flex, Text } from '@chakra-ui/react';
import * as React from 'react';
import { AlertTriangle, Download, Pencil, X, Save, Maximize, Minimize } from 'lucide-react';
import { Editor } from '@monaco-editor/react';
import { API_BASE_URL } from '../../config/api';
import { useTheme } from '../../contexts/ThemeContext';

interface FileEditorProps {
  fileContent: string;
  selectedFile: string;
  isEditing: boolean;
  isLoading: boolean;
  type: 'configs' | 'proxy_providers' | 'rule_providers';
  onEditClick: () => void;
  onSaveClick: () => void;
  onContentChange: (value: string | undefined) => void;
  onCancelEdit?: () => void;
}

export function FileEditor({
  fileContent,
  selectedFile,
  isEditing,
  isLoading,
  type,
  onEditClick,
  onSaveClick,
  onContentChange,
  onCancelEdit
}: FileEditorProps) {
  const [originalContent, setOriginalContent] = React.useState(fileContent);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    if (!isEditing) {
      setOriginalContent(fileContent);
    }
  }, [selectedFile, fileContent, isEditing]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isEditing && selectedFile) {
          onSaveClick();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, selectedFile, onSaveClick]);

  const handleCancel = () => {
    if (onCancelEdit) {
      onCancelEdit();
    } else {
      if (onEditClick) onEditClick();
    }
    onContentChange(originalContent);
  };
  const { isDark } = useTheme();

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <Box width="100%" height="100%">
      {selectedFile ? (
        <>
          <Box
            borderWidth={isFullscreen ? "0" : "1px"}
            borderRadius={isFullscreen ? "0" : "md"}
            height={isFullscreen ? "100vh" : "100%"}
            overflow="hidden"
            position={isFullscreen ? "fixed" : "relative"}
            top={isFullscreen ? 0 : "auto"}
            left={isFullscreen ? 0 : "auto"}
            zIndex={isFullscreen ? 9999 : "auto"}
            width={isFullscreen ? "100vw" : "auto"}
            bg={isDark ? "gray.900" : "white"}
          >
            <Editor
              height="100%"
              language="yaml"
              value={fileContent}
              onChange={onContentChange}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                readOnly: !isEditing,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
              loading={isLoading ? "Loading editor..." : undefined}
            />

            <Flex
              position="absolute"
              top={2}
              right={4}
              zIndex={100}
              gap={1}
            >
              <Button
                size="xs"
                variant="subtle"
                colorPalette="gray"
                onClick={toggleFullscreen}
                opacity={0.7}
                _hover={{ opacity: 1 }}
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </Button>

              <Button
                size="xs"
                variant="subtle"
                colorPalette="cyan"
                onClick={() => {
                  const pathMap = {
                    configs: 'configs',
                    proxy_providers: 'proxy-providers',
                    rule_providers: 'rule-providers'
                  };
                  const path = pathMap[type];
                  window.open(`${API_BASE_URL}/api/v1/mihomo/${path}/${selectedFile}/download`, '_blank');
                }}
                opacity={0.7}
                _hover={{ opacity: 1 }}
                title="Download"
              >
                <Download size={16} />
              </Button>

              {isEditing ? (
                <>
                  <Button
                    size="xs"
                    variant="subtle"
                    colorPalette="green"
                    onClick={onSaveClick}
                    opacity={0.7}
                    _hover={{ opacity: 1 }}
                    title="Save (Ctrl+S)"
                  >
                    <Save size={16} />
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    colorPalette="red"
                    onClick={handleCancel}
                    opacity={0.7}
                    _hover={{ opacity: 1 }}
                    title="Cancel"
                  >
                    <X size={16} />
                  </Button>
                </>
              ) : (
                <Button
                  size="xs"
                  variant="subtle"
                  colorPalette="blue"
                  onClick={onEditClick}
                  opacity={0.7}
                  _hover={{ opacity: 1 }}
                  title="Edit"
                >
                  <Pencil size={16} />
                </Button>
              )}
            </Flex>
          </Box>
        </>
      ) : (
        <Box
          height="100%"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          bg="bg.surface"
          borderRadius="md"
          borderWidth="1px"
          p={4}
        >
          <Box
            bg="blue.muted"
            color="blue.fg"
            p={4}
            borderRadius="md"
            mb={4}
            maxW="md"
            display="flex"
            alignItems="flex-start"
          >
            <AlertTriangle size={16} style={{ marginRight: '12px', marginTop: '2px' }} />
            <Box>
              <Text fontWeight="bold">Select a file to edit</Text>
              <Text fontSize="sm">
                Please select a file from the list on the left to view and edit its content.
              </Text>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
