import React from 'react'
import PropTypes from 'prop-types'
import Dialog from '@material-ui/core/Dialog'
import { withStyles } from '@material-ui/core/styles'
import { Query, Mutation } from 'react-apollo'
import { UPLOADS_QUERY } from '../../graphql/queries'
import { CREATE_UPLOAD } from '../../graphql/mutations'
import { ID, remote, uploadDocument, PATH_REGEX, sanitizeFileName } from '../../lib/remote'
import gql from 'graphql-tag'
import styles from './styles'
import UploadDropzoneDialogContent from '../UploadDropzoneDialogContent'

class UploadDropzoneDialog extends React.Component {
  state = {
    drag: false
  }

  handleDrop = async (files) => {
    const { order: { data: { currentOrder } } } = this.props
    let uploads = await Promise.all(
      files.map(async file => {
        let { name, size, type } = file
        let [,,, ext] = PATH_REGEX.exec(name).slice(1)
        let filename = `letter${ext}`
        let userFilename = sanitizeFileName(name)
        let { data } = await this.createUpload({
          name: userFilename,
          size,
          type,
          orderId: currentOrder.id
        })
        const { id } = data.createUpload
        let { data: { createPresignedPost } } = await this.props.client.mutate({
          mutation: gql` 
            mutation($key: String!) {
              createPresignedPost(key: $key)
            }
          `,
          variables: {
            key: `${id}/${filename}`
          }
        })

        await uploadDocument(file, filename, createPresignedPost)
        return id
      })
    )
    remote({ uploads }).then(channel => {
      let messages = []
      channel.on('message', (topic, buffer) => {
        let message = buffer.toString()
        console.log(message)
        messages.push(message)
        if (messages.length === uploads.length) {
          this.props.uploads.refetch()
          console.log('closing connection')
          channel.end(true, () => {
            console.log('connection closed')
          })
        }
      })
    })
  }

  onDragOver = evt => {
    this.setState(prevState => {
      return prevState.drag
        ? null
        : { drag: true }
    })
    evt.stopPropagation()
    evt.preventDefault()
  }

  dragLeave = (evt) => {
    this.setState(prevState => {
      return !prevState.drag
        ? null
        : { drag: false }
    })
  }

  onDragEnter = (evt) => {}

  createUpload = ({ orderId, ...variables }) =>
    this.props.mutate({ variables: { ...variables, orderId },
      optimisticResponse: {
        __typename: 'Mutation',
        createUpload: {
          __typename: 'Upload',
          ...variables,
          id: ID(),
          pages: 2,
          status: 'LOADING',
          file: null,
          thumbnail: null,
          orders: [{
            __typename: 'Order',
            id: orderId
          }]
        }
      },
      update: (store, { data: { createUpload } }) => {
        const uploadsQuery = store.readQuery({
          query: UPLOADS_QUERY
        })
        uploadsQuery.uploads.push(createUpload)
        store.writeQuery({ query: UPLOADS_QUERY, data: uploadsQuery })
      }
    })

  handleClick = () => {
    setTimeout(() => {
      this.ref.click()
    }, 0)
  }

  onDrop = evt => {
    console.log(evt)
    let files = Array.from(evt.dataTransfer.files)
    this.setState({
      drag: false
    }, () => {
      this.handleDrop(files)
    })
    evt.preventDefault()
    evt.stopPropagation()
  }

  render () {
    return (
      <Dialog
        open={this.props.open}
        maxWidth={false}
        fullScreen={window.innerWidth < 481}
        PaperProps={{
          classes: {
            root: this.props.classes.paper
          }
        }}
      >
        <div
          onDragEnter={this.onDragEnter}
          onDragOver={this.onDragOver}
          onDrop={this.onDrop}
          onDragLeave={this.dragLeave}
          className={this.state.drag ? 'drag' : ''}
        >
          <input
            className={this.props.classes.fileInput}
            type={'file'}
            ref={ref => {
              this.ref = ref
            }}
            onChange={evt => {
              this.handleDrop(Array.from(this.ref.files))
            }}
          />
          <UploadDropzoneDialogContent
            handleClick={this.handleClick}
            {...this.props}
          />
        </div>
      </Dialog>
    )
  }
}

class UploadDropzoneDialogQueries extends React.Component {
  render () {
    return (
      <Query query={UPLOADS_QUERY} skip={!this.props.open}>
        {(uploads) => (
          <Mutation mutation={CREATE_UPLOAD}>
            {(mutate) => (
              <UploadDropzoneDialog mutate={mutate} uploads={uploads} {...this.props} />
            )}
          </Mutation>
        )}
      </Query>
    )
  }
}

export default withStyles(styles)(UploadDropzoneDialogQueries)
