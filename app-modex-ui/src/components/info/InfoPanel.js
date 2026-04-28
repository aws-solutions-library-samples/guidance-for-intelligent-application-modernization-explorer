import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Box, SpaceBetween } from '@cloudscape-design/components';
import PropTypes from 'prop-types';

/**
 * InfoPanel component for displaying information in a modal
 * 
 * @param {Object} props - Component props
 * @param {string} props.title - Title of the info panel
 * @param {React.ReactNode} props.content - Content to display in the info panel
 * @param {string} [props.triggerText="Info"] - Text to display on the trigger button
 * @param {string} [props.triggerVariant="icon"] - Variant of the trigger button ("icon" or "normal")
 * @param {string} [props.triggerSize="normal"] - Size of the trigger button
 * @returns {React.ReactElement} InfoPanel component
 */
const InfoPanel = ({ 
  title, 
  content, 
  triggerText = "Info", 
  triggerVariant = "icon",
  triggerSize = "normal"
}) => {
  const { t } = useTranslation(['components', 'common']);
  const [visible, setVisible] = useState(false);

  return (
    <>
      {triggerVariant === "icon" ? (
        <Button
          variant="icon"
          iconName="status-info"
          onClick={() => setVisible(true)}
          ariaLabel={`Show information about ${title}`}
        />
      ) : (
        <Button
          variant="link"
          onClick={() => setVisible(true)}
          size={triggerSize}
        >
          {triggerText}
        </Button>
      )}

      <Modal
        visible={visible}
        onDismiss={() => setVisible(false)}
        header={title}
        size="large"
        footer={
          <Box float="right">
            <Button variant="primary" onClick={() => setVisible(false)}>
              {t('components:infoPanel.close')}
            </Button>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {typeof content === 'string' ? (
            <div dangerouslySetInnerHTML={{ __html: content }} />
          ) : (
            content
          )}
        </SpaceBetween>
      </Modal>
    </>
  );
};

InfoPanel.propTypes = {
  title: PropTypes.string.isRequired,
  content: PropTypes.node.isRequired,
  triggerText: PropTypes.string,
  triggerVariant: PropTypes.oneOf(['icon', 'normal']),
  triggerSize: PropTypes.oneOf(['normal', 'small', 'large'])
};

export default InfoPanel;
