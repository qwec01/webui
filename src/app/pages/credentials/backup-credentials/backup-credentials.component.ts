import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WebSocketService, KeychainCredentialService, AppLoaderService, 
  DialogService, ReplicationService, StorageService, CloudCredentialService } from 'app/services';
import { ModalService } from '../../../services/modal.service';
import { SshConnectionsFormComponent } from './ssh-connections/ssh-connections-form.component';
import { SshKeypairsFormComponent } from './ssh-keypairs/ssh-keypairs-form.component';
import { CloudCredentialsFormComponent } from './cloudcredentials/cloudcredentials-form.component';



@Component({
  selector: 'app-backup-credentials',
  templateUrl: './backup-credentials.component.html',
  styleUrls: ['./backup-credentials.component.scss'],
  providers: [KeychainCredentialService, ReplicationService, CloudCredentialService]
})
export class BackupCredentialsComponent implements OnInit {
  cloudCreds = [];
  SSHKeypairs = [];
  SSHCreds = [];
  cards: any;

  // Components included in this dashboard
  protected sshConnections = new SshConnectionsFormComponent(this.aroute,this.keychainCredentialService,
    this.ws,this.loader, this.dialogService, this.replicationService);
  protected sshKeypairs = new SshKeypairsFormComponent(this.aroute,this.ws,this.loader,
    this.dialogService,this.storage);
  protected cloudCredentials = new CloudCredentialsFormComponent(this.router, this.aroute,this.ws,
    this.cloudCredentialsService, this.dialogService, this.replicationService);
  

  constructor(private aroute: ActivatedRoute, private keychainCredentialService: KeychainCredentialService,
    private ws: WebSocketService, private loader: AppLoaderService, private dialogService: DialogService,
     private replicationService: ReplicationService, private storage: StorageService,
     private cloudCredentialsService: CloudCredentialService, private router: Router,
     private modalService: ModalService) {}

  ngOnInit(): void {
    this.getCreds();
  }

  getCreds() {
    this.ws.call('cloudsync.credentials.query').subscribe(credentials => {
      credentials.forEach(cred => {
        this.cloudCreds.push(cred);
      })
      this.ws.call('keychaincredential.query').subscribe(credentials=> {
        credentials.forEach(cred => {
          if (cred.type === 'SSH_KEY_PAIR') {
            this.SSHKeypairs.push(cred);
          } else if (cred.type === 'SSH_CREDENTIALS') {
            this.SSHCreds.push(cred);
          }
        })
        this.cards = [
          { name: 'cloudCredentials', flex: 40, label: 'Cloud Credentials',
            dataSource: this.cloudCreds, displayedColumns: ['name', 'provider', 'actions']
          },
          { name: 'sshConnections', flex: 30, label: 'SSH Connections',
            dataSource: this.SSHCreds, displayedColumns: ['name', 'actions']
          },
          { name: 'sshKeypairs', flex: 30, label: 'SSH Keypairs',
            dataSource: this.SSHKeypairs, displayedColumns: ['name', 'actions']
          }
        ];
      })
    })
  }

  doAdd(form: string, id?: number ) {
    let addComponent;
    switch (form) {
      case 'cloudCredentials':
        addComponent = this.cloudCredentials;
        break;
      case 'sshConnections':
        addComponent = this.sshConnections;
        break;
      case 'sshKeypairs':
        addComponent = this.sshKeypairs;
    }
    console.log('id', id)
    this.modalService.open('slide-in-form', addComponent, id);
  }

  doDelete(form: string, id: number ) {
    console.log(form)
  }

}
