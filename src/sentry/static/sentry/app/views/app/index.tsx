import $ from 'jquery';
import {RouteComponentProps} from 'react-router/lib/Router';
import {ThemeProvider} from 'emotion-theming';
import {browserHistory} from 'react-router';
import Cookies from 'js-cookie';
import PropTypes from 'prop-types';
import React from 'react';
import isEqual from 'lodash/isEqual';
import keydown from 'react-keydown';

import {Client} from 'app/api';
import {Config} from 'app/types';
import {DEPLOY_PREVIEW_CONFIG, EXPERIMENTAL_SPA} from 'app/constants';
import {displayDeployPreviewAlert} from 'app/actionCreators/deployPreview';
import {fetchGuides} from 'app/actionCreators/guides';
import {openCommandPalette} from 'app/actionCreators/modal';
import {setTransactionName} from 'app/utils/apm';
import {t} from 'app/locale';
import AlertActions from 'app/actions/alertActions';
import Alerts from 'app/components/alerts';
import ConfigStore from 'app/stores/configStore';
import ErrorBoundary from 'app/components/errorBoundary';
import GlobalModal from 'app/components/globalModal';
import GlobalStyles from 'app/styles/global';
import HookStore from 'app/stores/hookStore';
import Indicators from 'app/components/indicators';
import LoadingIndicator from 'app/components/loadingIndicator';
import NewsletterConsent from 'app/views/newsletterConsent';
import OrganizationsStore from 'app/stores/organizationsStore';
import getRouteStringFromRoutes from 'app/utils/getRouteStringFromRoutes';
import theme from 'app/utils/theme';
import withApi from 'app/utils/withApi';
import withConfig from 'app/utils/withConfig';

// TODO: Need better way of identifying anonymous pages that don't trigger redirect
const ALLOWED_ANON_PAGES = [
  /^\/accept\//,
  /^\/share\//,
  /^\/auth\/login\//,
  /^\/join-request\//,
];

function getAlertTypeForProblem(problem) {
  switch (problem.severity) {
    case 'critical':
      return 'error';
    default:
      return 'warning';
  }
}

type Props = {
  api: Client;
  config: Config;
} & RouteComponentProps<{}, {}>;

type State = {
  loading: boolean;
  error: boolean;
  needsUpgrade: boolean;
  newsletterConsentPrompt: boolean;
  user?: Config['user'];
};

class App extends React.Component<Props, State> {
  static childContextTypes = {
    location: PropTypes.object,
  };

  state = {
    loading: false,
    error: false,
    needsUpgrade: ConfigStore.get('user')?.isSuperuser && ConfigStore.get('needsUpgrade'),
    newsletterConsentPrompt: ConfigStore.get('user')?.flags?.newsletter_consent_prompt,
  };

  getChildContext() {
    return {
      location: this.props.location,
    };
  }

  componentDidMount() {
    this.props.api.request('/organizations/', {
      query: {
        member: '1',
      },
      success: data => {
        OrganizationsStore.load(data);
        this.setState({
          loading: false,
        });
      },
      error: () => {
        this.setState({
          loading: false,
          error: true,
        });
      },
    });

    this.props.api.request('/internal/health/', {
      success: data => {
        if (data && data.problems) {
          data.problems.forEach(problem => {
            AlertActions.addAlert({
              id: problem.id,
              message: problem.message,
              type: getAlertTypeForProblem(problem),
              url: problem.url,
            });
          });
        }
      },
      error: () => {}, // TODO: do something?
    });

    ConfigStore.get('messages').forEach(msg => {
      AlertActions.addAlert({
        message: msg.message,
        type: msg.level,
        neverExpire: true,
      });
    });

    if (DEPLOY_PREVIEW_CONFIG) {
      displayDeployPreviewAlert();
    }

    $(document).ajaxError(function(_evt, jqXHR) {
      const pageAllowsAnon = ALLOWED_ANON_PAGES.find(regex =>
        regex.test(window.location.pathname)
      );

      // Ignore error unless it is a 401
      if (!jqXHR || jqXHR.status !== 401 || pageAllowsAnon) {
        return;
      }

      const code = jqXHR?.responseJSON?.detail?.code;
      const extra = jqXHR?.responseJSON?.detail?.extra;

      // 401s can also mean sudo is required or it's a request that is allowed to fail
      // Ignore if these are the cases
      if (code === 'sudo-required' || code === 'ignore') {
        return;
      }

      // If user must login via SSO, redirect to org login page
      if (code === 'sso-required') {
        window.location.assign(extra.loginUrl);
        return;
      }

      // Otherwise, the user has become unauthenticated. Send them to auth
      Cookies.set('session_expired', '1');

      if (EXPERIMENTAL_SPA) {
        browserHistory.replace('/auth/login/');
      } else {
        window.location.reload();
      }
    });

    const user = ConfigStore.get('user');
    if (user) {
      HookStore.get('analytics:init-user').map(cb => cb(user));
    }

    fetchGuides();
  }

  componentDidUpdate(prevProps) {
    const {config} = this.props;
    if (!isEqual(config, prevProps.config)) {
      this.handleConfigStoreChange(config);
    }
    this.updateTracing();
  }

  componentWillUnmount() {
    OrganizationsStore.load([]);
  }

  mainContainerRef = React.createRef<HTMLDivElement>();

  updateTracing() {
    const route = getRouteStringFromRoutes(this.props.routes);
    setTransactionName(route);
  }

  handleConfigStoreChange(config) {
    // TODO(ts): What's the best way to type this?
    const newState: any = {};
    if (config.needsUpgrade !== undefined) {
      newState.needsUpgrade = config.needsUpgrade;
    }
    if (config.user !== undefined) {
      newState.user = config.user;
    }
    if (Object.keys(newState).length > 0) {
      this.setState(newState);
    }
  }

  @keydown('meta+shift+p', 'meta+k')
  openCommandPalette(e) {
    openCommandPalette();
    e.preventDefault();
    e.stopPropagation();
  }

  onConfigured = () => this.setState({needsUpgrade: false});

  // this is somewhat hackish
  handleNewsletterConsent = () =>
    this.setState({
      newsletterConsentPrompt: false,
    });

  handleGlobalModalClose = () => {
    if (typeof this.mainContainerRef.current?.focus === 'function') {
      // Focus the main container to get hotkeys to keep working after modal closes
      this.mainContainerRef.current.focus();
    }
  };

  renderBody() {
    const {needsUpgrade, newsletterConsentPrompt} = this.state;

    if (needsUpgrade) {
      const InstallWizard = React.lazy(() =>
        import(/* webpackChunkName: "InstallWizard" */ 'app/views/installWizard')
      );

      return (
        <React.Suspense fallback={null}>
          <InstallWizard onConfigured={this.onConfigured} />;
        </React.Suspense>
      );
    }

    if (newsletterConsentPrompt) {
      return <NewsletterConsent onSubmitSuccess={this.handleNewsletterConsent} />;
    }

    return this.props.children;
  }

  render() {
    if (this.state.loading) {
      return (
        <LoadingIndicator triangle>
          {t('Getting a list of all of your organizations.')}
        </LoadingIndicator>
      );
    }

    return (
      <ThemeProvider theme={theme}>
        <GlobalStyles theme={theme} />
        <div className="main-container" tabIndex={-1} ref={this.mainContainerRef}>
          <GlobalModal onClose={this.handleGlobalModalClose} />
          <Alerts className="messages-container" />
          <Indicators className="indicators-container" />
          <ErrorBoundary>{this.renderBody()}</ErrorBoundary>
        </div>
      </ThemeProvider>
    );
  }
}

export default withApi(withConfig(App));